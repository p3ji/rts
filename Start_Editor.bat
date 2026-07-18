@echo off
echo Starting RTS Game Editor...

echo Starting Editor Backend API on port 3001...
start "Editor Backend" cmd /c "node server/editor-api.js"

echo Starting Vite Web Server...
start "Web Server" cmd /k "npm run dev"

:: Wait 2 seconds for servers to initialize
timeout /t 2 >nul

:: Open the default browser to the editor page
start "" "http://localhost:5173/editor.html"
