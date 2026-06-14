@echo off
cd /d C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai
echo [%date% %time%] === assembly summary start === >> assembly_summary_log.txt
python summarize_assembly_bills.py >> assembly_summary_log.txt 2>&1
echo [%date% %time%] === done === >> assembly_summary_log.txt
