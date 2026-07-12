# 09-Security - Security & Backup Specifications

## Purpose
This document specifies policies, procedures, and schemas for application data security, local encryption, automated backup rules, and restore mechanisms.

## Scope
Covers database backups, password protection, and local encryption parameters.

## Definitions
*   **Encrypted Database:** Storing the database using AES-256 encryption.
*   **Backup on Close:** Automatically duplicating the database when the app exits.

## Design Decisions
1.  **Strict Local Storage:** No data is uploaded to remote servers. All backup operations target local directories.
2.  **MMEX-Style Rolling Backups:**
    *   Creates a backup on launch (`finance_backup_open_YYYYMMDD_HHMMSS.db`).
    *   Creates a backup on exit (`finance_backup_close_YYYYMMDD_HHMMSS.db`).
    *   Retains the last $N$ backups (configurable, default: 5) and purges older ones.

---

## Backup Logic Flows
```
Launch App -> Check backup settings -> Copy database to backup folder
Exit App   -> Copy database to backup folder -> Purge old backups beyond limit
```

## Examples
*   *Backup Rollover:* If the backup limit is 3 and a 4th backup is created on exit, the system automatically deletes the oldest backup file.

## Future Enhancements
*   Adding user-configured GPG encryption keys for automated local backup sealing.
*   Integrating YubiKey/FIDO2 hardware validation before database decryption.

## Open Questions
*   How should we prompt the user for database master passphrases without creating keylog vulnerability vectors?
