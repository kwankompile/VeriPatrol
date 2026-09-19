<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ProfileEmailChangeVerificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $verificationToken,
        public readonly int $expiresMinutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Verify your email change',
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'emails.profile-email-change-verification',
        );
    }
}
