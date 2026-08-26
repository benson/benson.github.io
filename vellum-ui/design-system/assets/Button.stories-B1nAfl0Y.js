import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{r as t,t as n}from"./controlPrimitives-Cg8obPNg.js";function r({disabled:e,label:t,onClick:r,shortcut:i,variant:a}){let o=document.createElement(`template`);o.innerHTML=n({label:t,variant:a,attrs:e?{disabled:!0}:{}});let s=o.content.firstElementChild;if(i){let e=document.createElement(`span`);e.className=`btn-shortcut`,e.textContent=i,s.append(e)}return s.addEventListener(`click`,r),s}var i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{t(),{expect:i,fn:a}=__STORYBOOK_MODULE_TEST__,o={title:`Components/Button`,tags:[`autodocs`],render:r,argTypes:{variant:{control:`select`,options:[`primary`,`secondary`,`danger`,`ink`]},label:{control:`text`},shortcut:{control:`text`},disabled:{control:`boolean`}},args:{disabled:!1,label:`add to shelf`,onClick:a(),shortcut:``,variant:`primary`}},s={play:async({args:e,canvas:t,userEvent:n})=>{await n.click(t.getByRole(`button`,{name:`add to shelf`})),await i(e.onClick).toHaveBeenCalledOnce()}},c={args:{label:`cancel`,variant:`secondary`}},l={args:{label:`remove book`,variant:`danger`}},u={args:{label:`search`,shortcut:`/`,variant:`ink`}},d={args:{disabled:!0,label:`saving…`}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'add to shelf'
    }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'cancel',
    variant: 'secondary'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'remove book',
    variant: 'danger'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'search',
    shortcut: '/',
    variant: 'ink'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    label: 'saving…'
  }
}`,...d.parameters?.docs?.source}}},f=[`Primary`,`Secondary`,`Danger`,`WithShortcut`,`Disabled`]})))()}p();export{l as Danger,d as Disabled,s as Primary,c as Secondary,u as WithShortcut,f as __namedExportsOrder,o as default};