# LAN Multiplayer Guide

This game is fully playable over a local area network (LAN) without requiring any external servers. No IP addresses or configuration need to be hardcoded, making it completely safe to share or commit to GitHub.

## How to Host a Match

1. Double-click `Start_LAN_Game.bat` in the project root.
2. Two command prompt windows will open automatically:
   - One running the **Relay Server** (handles the multiplayer messages).
   - One running the **Web Server** (Vite, handles serving the game files).
3. The Web Server window will print a "Network" address. It looks something like:
   `➜  Network:  http://192.168.x.x:5173/`
   **Keep this address handy, as your friend needs it.**
4. Your default browser will open to `http://localhost:5173/`. 
5. Go to the **LAN 1v1** tab, click **Host a match**, and you'll be given a 4-letter room code.

## How to Join a Match

1. Make sure you are on the same Wi-Fi or local network as the Host.
2. Open your web browser and type in the **Network address** the Host gave you (e.g., `http://192.168.1.15:5173/`).
3. Once the game loads, go to the **LAN 1v1** tab.
4. The Relay Server field will automatically detect the Host's IP address (no need to change it!).
5. Click **Join with code**, enter the 4-letter room code the Host received, and you're in!

## Note on Privacy
The `.bat` file simply tells the web server to expose itself to your local network and the game dynamically targets whatever address it was loaded from. This means your IP address is never stored in any configuration files or code, ensuring it will never accidentally be shared on GitHub.
