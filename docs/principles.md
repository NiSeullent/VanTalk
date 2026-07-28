# Principles — VanTalk v2026.7.29

1. **Web first**  
   The product surface is the hosted web client. Desktop is a thin hybrid shell around that same origin.

2. **No public backend keys**  
   Operator secrets (AWS gateway, bridge SSH, service-role DB keys) stay off GitHub. The public repo ships UI only.

3. **Cloud sync, not local LOCO**  
   As of v2026.7.29, fully local Java/LOCO desktop messaging is discontinued for the public distribution. The hybrid app does not embed a private Kakao protocol stack.

4. **User-held encryption where claimed**  
   Chat backups are sealed on the client before upload. Snapshot cutoffs hide history until backup/visibility is set.

5. **Honest packaging**  
   Version pages and patch notes describe what actually shipped — not private infra runbooks.
