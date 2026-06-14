# 국회 법안 제안이유 AI 요약 - Windows 작업 스케줄러 등록 (매일 10:30, PC ON 시)
$taskName   = "RadioPolicy-AssemblySummary"
$pythonPath = (Get-Command python).Source
$scriptPath = "C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai\summarize_assembly_bills.py"
$workDir    = "C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$trigger  = New-ScheduledTaskTrigger -Daily -At 10:30am
$action   = New-ScheduledTaskAction -Execute $pythonPath -Argument $scriptPath -WorkingDirectory $workDir
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -RunLevel Highest -Force

Write-Host "Done: $taskName registered. Runs daily at 10:30 (catches up if missed)." -ForegroundColor Green
