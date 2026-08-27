import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,r}from"./storyHelpers-BDeT8eX0.js";function i(){let e=n(),r=document.createElement(`div`);r.className=`tab-row`,r.setAttribute(`role`,`tablist`);let i=t(`div`,`Your saved books.`,`vui-story-card`);i.id=`library-tabpanel`,i.setAttribute(`role`,`tabpanel`);for(let[e,[n,a]]of[[`library`,`Your saved books.`],[`wishlist`,`Books you want to find.`],[`loans`,`Books currently on loan.`]].entries()){let o=t(`button`,n,e===0?`tab-btn active`:`tab-btn`);o.type=`button`,o.id=`${n}-tab`,o.setAttribute(`role`,`tab`),o.setAttribute(`aria-controls`,i.id),o.setAttribute(`aria-selected`,String(e===0)),o.tabIndex=e===0?0:-1,o.addEventListener(`click`,()=>{r.querySelectorAll(`[role="tab"]`).forEach(e=>{let t=e===o;e.classList.toggle(`active`,t),e.setAttribute(`aria-selected`,String(t)),e.tabIndex=t?0:-1}),i.setAttribute(`aria-labelledby`,o.id),i.textContent=a}),r.append(o)}return i.setAttribute(`aria-labelledby`,`library-tab`),e.append(r,i),e}function a(){let e=document.createElement(`div`);e.className=`segmented`,e.setAttribute(`role`,`group`),e.setAttribute(`aria-label`,`collection view`);for(let[n,r]of[`covers`,`list`,`compact`].entries()){let i=t(`button`,r,n===0?`segment-btn active`:`segment-btn`);i.type=`button`,i.setAttribute(`aria-pressed`,String(n===0)),i.addEventListener(`click`,()=>{e.querySelectorAll(`button`).forEach(e=>{let t=e===i;e.classList.toggle(`active`,t),e.setAttribute(`aria-pressed`,String(t))})}),e.append(i)}return e}function o(){let e=t(`span`,`A Wizard of Earthsea · hardcover`,`vui-story-note`),i=t(`button`,`✎`,`icon-btn`);i.type=`button`,i.setAttribute(`aria-label`,`edit book`);let a=t(`button`,`…`,`icon-btn`);a.type=`button`,a.setAttribute(`aria-label`,`more actions`),a.setAttribute(`aria-expanded`,`false`);let o=document.createElement(`div`);o.className=`ui-popover floating-menu`,o.setAttribute(`role`,`menu`),o.hidden=!0;let s=t(`button`,`duplicate`,`floating-menu-item`);s.type=`button`,s.setAttribute(`role`,`menuitem`);let c=t(`button`,`archive`,`floating-menu-item`);c.type=`button`,c.setAttribute(`role`,`menuitem`),o.append(s,c);let l=t(`p`,`No compact action selected.`,`vui-story-note`);l.setAttribute(`role`,`status`),i.addEventListener(`click`,()=>{i.setAttribute(`aria-pressed`,`true`),l.textContent=`Editing A Wizard of Earthsea.`}),a.addEventListener(`click`,()=>{let e=a.getAttribute(`aria-expanded`)===`true`;a.setAttribute(`aria-expanded`,String(!e)),o.hidden=e,l.textContent=e?`More actions closed.`:`More actions opened.`});for(let e of[s,c])e.addEventListener(`click`,()=>{l.textContent=`${e.textContent} selected for A Wizard of Earthsea.`,o.hidden=!0,a.setAttribute(`aria-expanded`,`false`)});return n(r(e,i,a),o,l)}var s,c,l,u,d,f;function p(){return(p=e((()=>{({expect:s}=__STORYBOOK_MODULE_TEST__),c={title:`Components/Controls`,tags:[`autodocs`]},l={render:i,play:async({canvas:e,canvasElement:t,userEvent:n})=>{await n.click(e.getByRole(`tab`,{name:`wishlist`})),await s(e.getByRole(`tabpanel`)).toHaveTextContent(`Books you want to find.`),await s(e.getByRole(`tab`,{name:`wishlist`})).toHaveAttribute(`aria-selected`,`true`),t.replaceChildren(i())}},u={render:a,play:async({canvas:e,canvasElement:t,userEvent:n})=>{let r=e.getByRole(`button`,{name:`compact`});await n.click(r),await s(r).toHaveAttribute(`aria-pressed`,`true`),t.replaceChildren(a())}},d={render:o,play:async({canvas:e,canvasElement:t,userEvent:n})=>{await n.click(e.getByRole(`button`,{name:`edit book`})),await s(e.getByRole(`status`)).toHaveTextContent(`Editing`),await n.click(e.getByRole(`button`,{name:`more actions`})),await s(e.getByRole(`menu`)).toBeVisible(),await n.click(e.getByRole(`menuitem`,{name:`duplicate`})),await s(e.getByRole(`status`)).toHaveTextContent(`duplicate selected`),t.replaceChildren(o())}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: renderTabs,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("tab", {
      name: "wishlist"
    }));
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("Books you want to find.");
    await expect(canvas.getByRole("tab", {
      name: "wishlist"
    })).toHaveAttribute("aria-selected", "true");
    canvasElement.replaceChildren(renderTabs());
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: renderSegmented,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    const compact = canvas.getByRole("button", {
      name: "compact"
    });
    await userEvent.click(compact);
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    canvasElement.replaceChildren(renderSegmented());
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: renderCompactActions,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("button", {
      name: "edit book"
    }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Editing");
    await userEvent.click(canvas.getByRole("button", {
      name: "more actions"
    }));
    await expect(canvas.getByRole("menu")).toBeVisible();
    await userEvent.click(canvas.getByRole("menuitem", {
      name: "duplicate"
    }));
    await expect(canvas.getByRole("status")).toHaveTextContent("duplicate selected");
    canvasElement.replaceChildren(renderCompactActions());
  }
}`,...d.parameters?.docs?.source}}},f=[`Tabs`,`SegmentedControl`,`CompactActions`]})))()}p();export{d as CompactActions,u as SegmentedControl,l as Tabs,f as __namedExportsOrder,c as default};