@echo off
echo Instalez dependente...
npm install
echo.
echo Construiesc .exe...
npm run build
echo.
echo Gata! Cauta installerul in folderul dist\
pause
