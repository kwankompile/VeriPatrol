<?php

namespace App\Events\Patrol;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PatrolRouteUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $patrolSessionId,
        public float $latitude,
        public float $longitude,
        public ?float $accuracy,
        public string $recordedAt,
        public ?string $routeId = null,
    ) {}

    /**
     * @return list<PrivateChannel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('patrol.monitoring'),
            new PrivateChannel('patrol.session.'.$this->patrolSessionId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'PatrolRouteUpdated';
    }

    /**
     * Compact scalar payload for live maps.
     * Data now originates from location_logs (id / location_log_id = location_logs.id).
     * Legacy patrol_routes writes may still emit this event during deprecation.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'patrol_session_id' => $this->patrolSessionId,
            'id' => $this->routeId,
            'location_log_id' => $this->routeId,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'accuracy' => $this->accuracy,
            'recorded_at' => $this->recordedAt,
        ];
    }
}
