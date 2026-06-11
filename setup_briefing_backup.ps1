# 모닝 브리핑 로컬 백업 — 매일 09:40 KST
# GitHub Actions 스케줄 전체 누락 대비 (2026-06-11 확인: 3중 cron + daily_crawl 백업 모두 skip)
# already_sent_today()가 중복 발송 차단 → GitHub이 정상 발송했으면 아무것도 안 함
# -StartWhenAvailable: 09:40에 PC가 꺼져 있었으면 부팅 후 즉시 실행

$taskName = "RadioPolicy-BriefingBackup"
$batPath  = "C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai\run_briefing_backup.bat"
$workDir  = "C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$trigger  = New-ScheduledTaskTrigger -Daily -At "09:40"
$action   = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $workDir
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -Force

Write-Host "Done: $taskName registered. Runs daily at 09:40 KST (or on next boot if missed)." -ForegroundColor Green
