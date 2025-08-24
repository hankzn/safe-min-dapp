(function(){
  const byId = (id)=>document.getElementById(id);
  function openSOP(){ byId('sopOverlay').style.display='flex'; }
  function closeSOP(){ byId('sopOverlay').style.display='none'; }
  window.addEventListener('DOMContentLoaded', function(){
    const fab = byId('sopFab'), ovl = byId('sopOverlay'), btnClose = byId('sopClose');
    fab && fab.addEventListener('click', openSOP);
    btnClose && btnClose.addEventListener('click', closeSOP);
    ovl && ovl.addEventListener('click', (e)=>{ if(e.target===ovl) closeSOP(); });
  });
})();