@echo off
echo Starting Kingdoms of Wobbleton...

echo Starting Relay Server...
start "Relay Server" cmd /c "npm run relay"

echo Starting Web Server (Vite)...
echo NOTE: Check the "Web Server" window for your Network IP address (e.g. http://192.168.1.X:5173). 
echo Give that address to your friends to join on LAN!
start "Web Server" cmd /k "npm run dev -- --host"

:: Wait 2 seconds for servers to initialize
timeout /t 2 >nul

:: Open the default browser to the game
start "" "http://localhost:5173"
