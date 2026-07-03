@echo off
set PYTHONUTF8=1
cd /d C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai
echo [%date% %time%] === BRIEFING BACKUP START === >> briefing_backup_log.txt
"C:\Users\SKTelecom\AppData\Local\Programs\Python\Python312\python.exe" morning_briefing.py >> briefing_backup_log.txt 2>&1
echo [%date% %time%] === DONE === >> briefing_backup_log.txt
