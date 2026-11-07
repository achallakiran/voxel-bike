let closeOpen:((restore?:boolean)=>void)|undefined;
const refreshers:(()=>void)[]=[];

export function closeOptionMenu(){closeOpen?.();}
export function refreshOptionControls(){for(const refresh of refreshers)refresh();}

export function mountOptionControls(){
  for(const select of document.querySelectorAll<HTMLSelectElement>('select')){
    const label=select.closest('label');
    const name=label?.firstChild?.textContent?.trim()||select.getAttribute('aria-label')||'Options';
    select.hidden=true;
    const button=document.createElement('button');
    button.type='button';button.className='option-control';
    button.id=select.id+'Control';
    button.setAttribute('aria-haspopup','listbox');
    button.setAttribute('aria-expanded','false');
    const list=document.createElement('div');
    list.className='option-list';list.id=select.id+'Options';list.hidden=true;
    list.setAttribute('role','listbox');list.setAttribute('aria-label',name);
    button.setAttribute('aria-controls',list.id);
    const options=Array.from(select.options,option=>{
      const item=document.createElement('button');
      item.type='button';item.className='option-item';item.setAttribute('role','option');
      item.textContent=option.textContent;item.disabled=option.disabled;
      item.addEventListener('click',()=>{
        select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
        refresh();close(true);
      });
      list.append(item);return item;
    });
    function refresh(){
      const selected=select.selectedOptions[0];
      button.textContent=selected?.textContent??'';
      button.setAttribute('aria-label',name+' · '+(selected?.textContent??''));
      button.disabled=select.disabled;
      options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===select.selectedIndex)));
    }
    function close(restore=false){
      list.hidden=true;button.setAttribute('aria-expanded','false');
      if(closeOpen===close)closeOpen=undefined;
      if(restore)button.focus({preventScroll:true});
    }
    function open(){
      closeOpen?.();
      refresh();list.hidden=false;
      const bounds=button.getBoundingClientRect();
      const width=Math.min(innerWidth-20,Math.max(bounds.width,180));
      list.style.width=width+'px';
      list.style.maxHeight=Math.max(80,innerHeight-24)+'px';
      const height=Math.min(list.scrollHeight,innerHeight-24);
      const top=bounds.bottom+height+6<innerHeight?bounds.bottom+6:Math.max(10,bounds.top-height-6);
      list.style.left=Math.min(innerWidth-width-10,Math.max(10,bounds.left))+'px';
      list.style.top=top+'px';
      list.style.maxHeight=Math.max(80,innerHeight-top-10)+'px';
      button.setAttribute('aria-expanded','true');closeOpen=close;
      (options[select.selectedIndex]??options[0]).focus({preventScroll:true});
    }
    button.addEventListener('click',()=>list.hidden?open():close(true));
    button.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open();}
    });
    list.addEventListener('keydown',event=>{
      const current=options.indexOf(document.activeElement as HTMLButtonElement);
      let index=current;
      if(event.key==='ArrowDown')index=(current+1)%options.length;
      else if(event.key==='ArrowUp')index=(current-1+options.length)%options.length;
      else if(event.key==='Home')index=0;
      else if(event.key==='End')index=options.length-1;
      else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
      else if(event.key==='Tab'){close(true);return;}
      else return;
      event.preventDefault();options[index].focus({preventScroll:true});
    });
    document.addEventListener('pointerdown',event=>{
      if(!list.hidden&&!list.contains(event.target as Node)&&!button.contains(event.target as Node))close();
    });
    select.addEventListener('change',refresh);
    window.addEventListener('resize',()=>close());
    refreshers.push(refresh);
    select.after(button);document.body.append(list);refresh();
  }
}
