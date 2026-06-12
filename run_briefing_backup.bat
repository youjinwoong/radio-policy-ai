@echo off
cd /d C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai
echo [%date% %time%] === BRIEFING BACKUP START === >> briefing_backup_log.txt
python morning_briefing.py >> briefing_backup_log.txt 2>&1
echo [%date% %time%] === DONE === >> briefing_backup_log.txt
