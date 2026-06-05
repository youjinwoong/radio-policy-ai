$taskName   = "RadioPolicyCrawler"
$pythonPath = (Get-Command python).Source
$scriptPath = "C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai\crawler.py"
$workDir    = "C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Hours 1) -Once -At (Get-Date).Date

$action = New-ScheduledTaskAction -Execute $pythonPath -Argument $scriptPath -WorkingDirectory $workDir

$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -RunLevel Highest -Force

Write-Host "Done: $taskName registered. Runs every hour." -ForegroundColor Green
