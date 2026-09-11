# Physical-device test checklist

Automated tests verify the protocol and Worker behavior, but they cannot reproduce phone cameras, background execution, audio routes, or real mobile networks. Run this checklist on a release candidate.

1. Start the Baby Unit and allow camera and microphone access.
2. Confirm the rear-camera preview appears and the app keeps the screen awake.
3. Enter or scan the displayed code on a Parent Unit.
4. Confirm the Baby Unit says **1 parent connected** and live video and audio reach the Parent.
5. While the invite remains visible, join from a second Parent and confirm both streams work independently.
6. On each Parent, hold **Talk**, speak, and verify the Baby Unit plays audio only while the control is held.
7. Enable **Audio Only** and verify video traffic for that Parent stops while audio continues.
8. While the Parent is showing video, background the app and lock the phone. Listen continuously for at least 30 minutes and confirm the connection remains active.
9. Enable monitoring alerts, send a test alert, make sustained sound near the Baby Unit, and verify the locked Parent receives a sound alert.
10. Disconnect the Baby Unit and verify the Parent receives an interruption warning.
11. Confirm Baby battery and charging state update; exercise the low-battery and unplugged alerts.
12. Unlock the Parent and verify video resumes without having to select **Show Video**. Then explicitly select **Audio Only**, repeat the background-and-lock test, and verify that preference also remains unchanged.
13. Disable and restore the active network and confirm **Reconnecting** returns to **Monitoring live**.
14. Force-quit and reopen each role, choose **Continue**, and verify the saved session reconnects.
15. Repeat a connection across Wi-Fi and cellular so at least one test selects a TURN relay. Also test a Wi-Fi/cellular transition during monitoring.
16. Connect and disconnect Bluetooth headphones and confirm audio route changes remain usable.
17. End monitoring from each role and verify the camera, microphone, audio session, server session, and saved **Continue** action are released.

For multi-Parent release testing, use one Baby phone and three Parent phones. Record the device models, OS versions, networks, whether the selected ICE path was direct or relayed, and any reconnection time.
