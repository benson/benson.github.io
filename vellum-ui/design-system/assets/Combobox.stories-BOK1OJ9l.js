import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{n as t,t as n}from"./outsideClick-DbUb1t7v.js";function r(e,n={}){let{getItems:r,onSelect:i,toLabel:a=e=>String(e?.label??e??``),toHint:o=e=>String(e?.hint??``),toDataset:s=null,maxItems:c=8,minLength:l=0,openOnFocus:u=!0}=n;if(!e||typeof r!=`function`)return null;let d=e.ownerDocument,f=e.closest(`.combobox`)||v(),p=d.createElement(`div`);p.className=`combobox-list`,p.setAttribute(`role`,`listbox`),p.hidden=!0,f.append(p),e.setAttribute(`role`,`combobox`),e.setAttribute(`aria-expanded`,`false`),e.setAttribute(`autocomplete`,`off`);let m=[],h=-1,g=0,_=null;function v(){let t=d.createElement(`div`);return t.className=`combobox`,e.parentNode.insertBefore(t,e),t.append(e),t}async function y(){let t=e.value.trim();if(t.length<l)return C();let n=++g,i=await r(t);if(n===g){if(m=(Array.isArray(i)?i:[]).slice(0,c),h=-1,!m.length)return C();b(),S()}}function b(){p.textContent=``,m.forEach((e,t)=>{let n=d.createElement(`button`);n.type=`button`,n.className=`combobox-option`,n.setAttribute(`role`,`option`),n.dataset.index=String(t);let r=s?.(e);if(r)for(let[e,t]of Object.entries(r))t!=null&&(n.dataset[e]=String(t));let i=d.createElement(`span`);i.className=`combobox-option-label`,i.textContent=a(e),n.append(i);let c=o(e);if(c){let e=d.createElement(`span`);e.className=`combobox-option-hint`,e.textContent=c,n.append(e)}n.addEventListener(`pointerdown`,e=>e.preventDefault()),n.addEventListener(`click`,()=>w(t)),p.append(n)}),x()}function x(){for(let e of p.children){let t=Number(e.dataset.index)===h;e.classList.toggle(`is-active`,t),e.setAttribute(`aria-selected`,String(t))}p.children[h]?.scrollIntoView?.({block:`nearest`})}function S(){p.hidden&&(p.hidden=!1,e.setAttribute(`aria-expanded`,`true`),_=t(f,C))}function C(){p.hidden||(p.hidden=!0,e.setAttribute(`aria-expanded`,`false`),h=-1,_?.(),_=null)}function w(t){let n=m[t];n!=null&&(e.value=a(n),C(),i?.(n))}function T(e){if(p.hidden&&[`ArrowDown`,`ArrowUp`].includes(e.key)){e.preventDefault(),y();return}if(!p.hidden){if(e.key===`ArrowDown`||e.key===`ArrowUp`){e.preventDefault();let t=e.key===`ArrowDown`?1:-1;h=(h+t+m.length)%m.length,x()}else e.key===`Enter`?h>=0&&(e.preventDefault(),w(h)):e.key===`Escape`?(e.preventDefault(),C()):e.key===`Tab`&&C()}}return e.addEventListener(`input`,y),e.addEventListener(`keydown`,T),u&&e.addEventListener(`focus`,y),{close:C,refresh:y,destroy(){C(),e.removeEventListener(`input`,y),e.removeEventListener(`keydown`,T),u&&e.removeEventListener(`focus`,y),p.remove()}}}function i(){return(i=e((()=>{n()})))()}function a({initialValue:e,minLength:t,onSelect:n,openOnFocus:i,placeholder:a}){let o=document.createElement(`div`);o.className=`vui-story-stack`,o.innerHTML=`
    <label class="vui-story-field">
      <span class="vui-story-label">book</span>
      <span class="combobox"><input class="input" type="search"></span>
    </label>
    <p class="vui-story-note" aria-live="polite">No book selected.</p>
  `;let s=o.querySelector(`input`),u=o.querySelector(`.vui-story-note`);return s.value=e,s.placeholder=a,l=r(s,{minLength:t,openOnFocus:i,getItems:async e=>{let t=e.toLowerCase();return c.filter(e=>e.label.toLowerCase().includes(t))},toHint:e=>e.hint,onSelect:e=>{u.textContent=`Selected ${e.label}.`,n(e)}}),o}var o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i(),{expect:o,fn:s}=__STORYBOOK_MODULE_TEST__,c=[{label:`A Wizard of Earthsea`,hint:`Ursula K. Le Guin`},{label:`The Left Hand of Darkness`,hint:`Ursula K. Le Guin`},{label:`The Dispossessed`,hint:`Ursula K. Le Guin`},{label:`Piranesi`,hint:`Susanna Clarke`}],l=null,u={title:`Components/Combobox`,tags:[`autodocs`],render:a,async beforeEach(){return()=>{l?.destroy(),l=null}},argTypes:{initialValue:{control:`text`},placeholder:{control:`text`},minLength:{control:{type:`number`,min:0,max:5}},openOnFocus:{control:`boolean`}},args:{initialValue:``,minLength:0,onSelect:s(),openOnFocus:!0,placeholder:`search the catalog…`}},d={play:async({args:e,canvas:t,userEvent:n})=>{let r=t.getByRole(`combobox`);await n.click(r),await n.type(r,`left`),await t.findByRole(`option`,{name:/The Left Hand of Darkness/}),await n.keyboard(`{ArrowDown}{Enter}`),await o(r).toHaveValue(`The Left Hand of Darkness`),await o(e.onSelect).toHaveBeenCalledOnce()}},f={args:{minLength:2,openOnFocus:!1}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvas,
    userEvent
  }) => {
    const input = canvas.getByRole('combobox');
    await userEvent.click(input);
    await userEvent.type(input, 'left');
    await canvas.findByRole('option', {
      name: /The Left Hand of Darkness/
    });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(input).toHaveValue('The Left Hand of Darkness');
    await expect(args.onSelect).toHaveBeenCalledOnce();
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    minLength: 2,
    openOnFocus: false
  }
}`,...f.parameters?.docs?.source}}},p=[`SearchAndSelect`,`MinimumQuery`]})))()}m();export{f as MinimumQuery,d as SearchAndSelect,p as __namedExportsOrder,u as default};