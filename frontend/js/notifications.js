const _pageRender = async () => {
   const container = document.getElementById('notifs-container');
   
   const loadNotifs = async () => {
      const notifs = await Store.getNotifications();
      if(notifs.length === 0) {
         UI.renderEmptyState('notifs-container', 'No notifications', 'You\'re all caught up!', window.icon('bell'));
         return;
      }
      
      container.innerHTML = notifs.map(n => `
         <div class="list-item" style="border:none; border-bottom:1px solid var(--border); border-radius:0; padding:16px; ${n.is_read ? 'opacity:0.6;' : 'background-color:var(--bg-app);'}">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
               ${n.type === 'mention' ? window.icon('atSign') : (n.type === 'invitation' ? window.icon('userPlus') : window.icon('bell'))}
            </div>
            <div style="flex:1;">
               <div class="text-bold">${Utils.escapeHtml(n.message)}</div>
               <div class="text-small text-muted">${Utils.formatDate(n.created_at)}</div>
               
               ${n.type === 'invitation' && n.memberContext && n.memberContext.status === 'pending' ? `
                  <div class="mt-2 d-flex gap-2">
                     <button class="btn btn-primary text-small" onclick="respondInvite('${n.memberContext.id}', true)">Accept</button>
                     <button class="btn btn-secondary text-small" onclick="respondInvite('${n.memberContext.id}', false)">Reject</button>
                  </div>
               ` : ''}
            </div>
            ${!n.is_read ? `<button class="btn btn-ghost text-small" onclick="markRead('${n.id}')">Mark read</button>` : ''}
         </div>
      `).join('');
   };
   
   window.markRead = async (id) => {
      await Store.markNotificationRead(id);
      loadNotifs();
      if(Layout && Layout.updateNotificationsBadge) Layout.updateNotificationsBadge();
   };
   
   window.respondInvite = async (id, accept) => {
       await Store.respondInvitation(id, accept);
       UI.toast(accept ? 'Invitation accepted' : 'Invitation rejected', 'success');
       document.dispatchEvent(new Event('crh_user_changed'));
   };
   
   document.getElementById('btn-mark-all').addEventListener('click', async () => {
      const notifs = await Store.getNotifications();
      for(const n of notifs) {
         if(!n.is_read) await Store.markNotificationRead(n.id);
      }
      loadNotifs();
      if(Layout && Layout.updateNotificationsBadge) Layout.updateNotificationsBadge();
   });
   
   loadNotifs();
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
