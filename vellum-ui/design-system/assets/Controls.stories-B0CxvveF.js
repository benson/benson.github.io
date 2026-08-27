import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,r}from"./storyHelpers-BDeT8eX0.js";function i(){let e=n(),r=document.createElement(`div`);r.className=`tab-row`,r.setAttribute(`role`,`tablist`);let i=t(`div`,`Your saved books.`,`vui-story-card`);i.id=`library-tabpanel`,i.setAttribute(`role`,`tabpanel`);for(let[e,[n,a]]of[[`library`,`Your saved books.`],[`wishlist`,`Books you want to find.`],[`loans`,`Books currently on loan.`]].entries()){let o=t(`button`,n,e===0?`tab-btn active`:`tab-btn`);o.type=`button`,o.id=`${n}-tab`,o.setAttribute(`role`,`tab`),o.setAttribute(`aria-controls`,i.id),o.setAttribute(`aria-selected`,String(e===0)),o.tabIndex=e===0?0:-1,o.addEventListener(`click`,()=>{r.querySelectorAll(`[role="tab"]`).forEach(e=>{let t=e===o;e.classList.toggle(`active`,t),e.setAttribute(`aria-selected`,String(t)),e.tabIndex=t?0:-1}),i.setAttribute(`aria-labelledby`,o.id),i.textContent=a}),r.append(o)}return i.setAttribute(`aria-labelledby`,`library-tab`),e.append(r,i),e}function a(){let e=document.createElement(`div`);e.className=`segmented`,e.setAttribute(`role`,`group`),e.setAttribute(`aria-label`,`collection view`);for(let[n,r]of[`covers`,`list`,`compact`].entries()){let i=t(`button`,r,n===0?`segment-btn active`:`segment-btn`);i.type=`button`,i.setAttribute(`aria-pressed`,String(n===0)),i.addEventListener(`click`,()=>{e.querySelectorAll(`button`).forEach(e=>{let t=e===i;e.classList.toggle(`active`,t),e.setAttribute(`aria-pressed`,String(t))})}),e.append(i)}return e}function o(){let e=t(`span`,`A Wizard of Earthsea · hardcover`,`vui-story-note`),n=t(`button`,`✎`,`icon-btn`);n.type=`button`,n.setAttribute(`aria-label`,`edit book`);let i=t(`button`,`…`,`icon-btn`);return i.type=`button`,i.setAttribute(`aria-label`,`more actions`),r(e,n,i)}var s,c,l,u,d,f;function p(){return(p=e((()=>{({expect:s}=__STORYBOOK_MODULE_TEST__),c={title:`Components/Controls`,tags:[`autodocs`]},l={render:i,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`tab`,{name:`wishlist`})),await s(e.getByRole(`tabpanel`)).toHaveTextContent(`Books you want to find.`),await s(e.getByRole(`tab`,{name:`wishlist`})).toHaveAttribute(`aria-selected`,`true`)}},u={render:a,play:async({canvas:e,userEvent:t})=>{let n=e.getByRole(`button`,{name:`compact`});await t.click(n),await s(n).toHaveAttribute(`aria-pressed`,`true`)}},d={render:o},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: renderTabs,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('tab', {
      name: 'wishlist'
    }));
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Books you want to find.');
    await expect(canvas.getByRole('tab', {
      name: 'wishlist'
    })).toHaveAttribute('aria-selected', 'true');
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: renderSegmented,
  play: async ({
    canvas,
    userEvent
  }) => {
    const compact = canvas.getByRole('button', {
      name: 'compact'
    });
    await userEvent.click(compact);
    await expect(compact).toHaveAttribute('aria-pressed', 'true');
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: renderCompactActions
}`,...d.parameters?.docs?.source}}},f=[`Tabs`,`SegmentedControl`,`CompactActions`]})))()}p();export{d as CompactActions,u as SegmentedControl,l as Tabs,f as __namedExportsOrder,c as default};