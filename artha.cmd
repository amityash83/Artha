@echo off
rem Artha dev control for Windows cmd.exe. Same commands as ./artha on macOS/Linux;
rem the logic lives in scripts\artha.mjs. Run "artha help" for the list.
node "%~dp0scripts\artha.mjs" %*
