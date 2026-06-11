@echo off
cd /d C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai
echo [%date% %time%] === 브리핑 백업 실행 === >> briefing_backup_log.txt
python morning_briefing.py >> briefing_backup_log.txt 2>&1
echo [%date% %time%] === 완료 === >> briefing_backup_log.txt
