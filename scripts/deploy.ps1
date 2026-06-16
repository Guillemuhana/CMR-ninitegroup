# Script de despliegue para Windows PowerShell
# Uso: Editá el mensaje de commit si querés, luego ejecutá desde la raíz del repo:
#   .\scripts\deploy.ps1 -Message "Deploy: integra NINI BOT prompt"
param(
  [string]$Message = "Deploy: integra NINI BOT prompt"
)

Write-Host "Staging changes..."
git add -A

Write-Host "Committing..."
git commit -m "$Message"

Write-Host "Pushing to origin (current branch)..."
git push origin HEAD

Write-Host "If you have Vercel CLI configured and want to trigger a production deploy, run:"
Write-Host "  vercel --prod --confirm"
Write-Host "Or go to Vercel dashboard to trigger a deployment from the pushed branch."}