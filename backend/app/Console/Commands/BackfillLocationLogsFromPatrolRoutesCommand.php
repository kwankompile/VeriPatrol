<?php

namespace App\Console\Commands;

use App\Models\LocationLog;
use App\Models\PatrolRoute;
use App\Models\PatrolSession;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Idempotent optional backfill: create missing location_logs from legacy patrol_routes.
 * Does not overwrite existing location logs. Safe to re-run.
 */
class BackfillLocationLogsFromPatrolRoutesCommand extends Command
{
    protected $signature = 'patrol:backfill-location-logs-from-routes
                            {--dry-run : Report actions without writing}
                            {--session= : Limit to a single patrol_session UUID}
                            {--limit=500 : Maximum patrol_routes rows to scan}';

    protected $description = 'Idempotently backfill missing location_logs from legacy patrol_routes (optional; not run on deploy)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $limit = max(1, (int) $this->option('limit'));
        $sessionId = $this->option('session');

        $query = PatrolRoute::query()->orderBy('recorded_at')->orderBy('id');

        if (is_string($sessionId) && $sessionId !== '') {
            $query->where('patrol_session_id', $sessionId);
        }

        $routes = $query->limit($limit)->get();

        $scanned = 0;
        $created = 0;
        $skipped = 0;
        $failed = 0;

        foreach ($routes as $route) {
            $scanned++;

            try {
                $session = PatrolSession::query()->find($route->patrol_session_id);
                if ($session === null) {
                    $skipped++;
                    $this->warn("Skip route {$route->id}: missing patrol session.");

                    continue;
                }

                $recordedAt = $route->recorded_at instanceof Carbon
                    ? $route->recorded_at
                    : ($route->recorded_at ? Carbon::parse($route->recorded_at) : null);

                $timestampMs = $recordedAt?->getTimestampMs()
                    ?? ($route->created_at?->getTimestampMs() ?? now()->getTimestampMs());

                $alreadyExists = LocationLog::query()
                    ->where('patrol_session_id', $route->patrol_session_id)
                    ->where('latitude', $route->latitude)
                    ->where('longitude', $route->longitude)
                    ->where('timestamp', $timestampMs)
                    ->exists();

                if ($alreadyExists) {
                    $skipped++;

                    continue;
                }

                if ($dryRun) {
                    $created++;
                    $this->line("[dry-run] would create location_log from route {$route->id}");

                    continue;
                }

                DB::transaction(function () use ($route, $session, $timestampMs): void {
                    LocationLog::query()->create([
                        'id' => (string) Str::uuid(),
                        'patrol_session_id' => $route->patrol_session_id,
                        'user_id' => $session->user_id,
                        'latitude' => $route->latitude,
                        'longitude' => $route->longitude,
                        'accuracy' => $route->accuracy ?? 0.0,
                        'timestamp' => $timestampMs,
                        'server_received_at' => $route->created_at ?? now(),
                        'source' => 'sync',
                        'tracking_state' => 'offline',
                        'speed' => null,
                        'heading' => null,
                    ]);
                });

                $created++;
            } catch (Throwable $e) {
                $failed++;
                report($e);
                $this->error("Failed route {$route->id}: {$e->getMessage()}");
            }
        }

        $this->info('Backfill complete'.($dryRun ? ' (dry-run)' : '').'.');
        $this->line("Scanned: {$scanned}");
        $this->line('Created: '.$created.($dryRun ? ' (would create)' : ''));
        $this->line("Skipped: {$skipped}");
        $this->line("Failed: {$failed}");
        $this->comment('Source label for migrated rows: source=sync, tracking_state=offline (legacy route backfill).');

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
