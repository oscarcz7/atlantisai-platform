-- Last accepted TOTP time-step counter: rejects replay of a code within its validity window.
ALTER TABLE "staff_users" ADD COLUMN "totp_last_counter" INTEGER;
