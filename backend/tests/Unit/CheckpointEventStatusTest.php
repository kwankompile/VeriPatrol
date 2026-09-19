<?php

namespace Tests\Unit;

use App\Support\CheckpointEventStatus;
use PHPUnit\Framework\TestCase;

class CheckpointEventStatusTest extends TestCase
{
    public function test_normalize_input_rejects_non_scalar_values_unchanged(): void
    {
        $this->assertSame(['bad'], CheckpointEventStatus::normalizeInput(['bad']));
    }

    public function test_normalize_maps_legacy_statuses(): void
    {
        $this->assertSame('needs_review', CheckpointEventStatus::normalize('uncertain'));
        $this->assertSame('missed', CheckpointEventStatus::normalize('rejected'));
        $this->assertSame('verified', CheckpointEventStatus::normalize('verified'));
    }

    public function test_canonical_excludes_legacy_values(): void
    {
        $this->assertNotContains('uncertain', CheckpointEventStatus::canonical());
        $this->assertNotContains('rejected', CheckpointEventStatus::canonical());
        $this->assertContains('needs_review', CheckpointEventStatus::canonical());
        $this->assertContains('missed', CheckpointEventStatus::canonical());
    }
}
