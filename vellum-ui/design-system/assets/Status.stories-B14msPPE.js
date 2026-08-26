import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,n as r,r as i}from"./storyHelpers-SrU9jVcn.js";import{n as a,r as o,t as s}from"./motion-D_OjNL95.js";function c(e){return String(e??``).trim()}function l(e){return(Array.isArray(e)?e:[e]).flatMap(e=>String(e||``).split(/\s+/)).map(e=>e.trim()).filter(Boolean)}function u(e,t={}){for(let[n,r]of Object.entries(t||{}))!n||r==null||(e.dataset[n]=String(r))}function d(e={}){return{enabled:!!e.enabled,className:l(e.className).join(` `),label:String(e.label||`remove`),text:e.text==null?`×`:String(e.text),dataset:e.dataset||{}}}function f(e,t){e&&!e.createElement&&(t=e,e=globalThis.document);let{text:n=``,className:r=``,variant:i=`default`,dataset:a={},title:o=``,prefixNode:s=null,remove:f={}}=t||{};if(!e?.createElement)return null;let p=c(n);if(!p&&!s)return null;let m=[`ui-chip`,`ui-chip-${String(i||`default`).trim()}`];m.push(...l(r));let h=e.createElement(`span`);h.className=m.join(` `),o&&(h.title=String(o)),u(h,a),s&&h.append(s);let g=e.createElement(`span`);g.className=`ui-chip-label`,g.textContent=p,h.append(g);let _=d(f);if(_.enabled){let t=e.createElement(`button`);t.className=[`ui-chip-remove`,_.className].filter(Boolean).join(` `),t.type=`button`,t.setAttribute(`aria-label`,_.label),u(t,_.dataset),t.textContent=_.text,h.append(t)}return h}function p(){return(p=e((()=>{})))()}function m(e,t={}){if(!e)return null;let n=e.ownerDocument||document,r=`kind`in t||`message`in t||`detail`in t||`retryAction`in t?g(n,t):h(n,t);return e.replaceChildren(r),r}function h(e,{label:t,tone:n=`neutral`,icon:r=``}={}){let i=e.createElement(`span`);if(i.className=`status-state status-state-${_(n)}`,r){let t=e.createElement(`span`);t.className=`status-state-icon`,t.textContent=r,i.append(t)}let a=e.createElement(`span`);return a.className=`status-state-label`,a.textContent=t||``,i.append(a),i}function g(e,t={}){let n=v(t.kind),r=e.createElement(`div`);if(r.className=`status-state status-state-${n}`,r.setAttribute(`role`,y(n)),r.setAttribute(`aria-live`,b(n)),n===`loading`){let t=e.createElement(`span`);t.className=`loading-spinner`,t.setAttribute(`aria-hidden`,`true`),r.append(t)}let i=e.createElement(`span`);if(i.className=`status-state-message`,i.textContent=t.message||``,r.append(i),t.detail){let n=e.createElement(`span`);n.className=`status-state-detail`,n.textContent=t.detail,r.append(n)}if(n===`retryable-error`&&t.retryAction){let n=e.createElement(`button`);n.className=`btn btn-secondary status-state-retry`,n.type=`button`,n.dataset.statusAction=t.retryAction,n.textContent=t.retryLabel||`retry`,r.append(n)}return r}function _(e){return x.has(e)?e:`neutral`}function v(e){return S.has(e)?e:`compact`}function y(e){return e===`inline-error`||e===`blocking-error`||e===`retryable-error`?`alert`:`status`}function b(e){return e===`inline-error`||e===`blocking-error`||e===`retryable-error`?`assertive`:`polite`}var x,S;function C(){return(C=e((()=>{x=new Set([`neutral`,`success`,`warn`,`danger`]),S=new Set([`empty`,`loading`,`inline-error`,`blocking-error`,`retryable-error`,`compact`])})))()}function w(e){let t=e.querySelector(`.toast-stack`);return t||(t=e.createElement(`div`),t.className=`toast-stack`,e.body.append(t)),t}function T(e,t={}){let{tone:n=`neutral`,duration:r=4e3,dismissLabel:i=`dismiss`,documentRef:o=globalThis.document,motion:c=`auto`,reason:l=`manual`,event:u=null}=t;if(!o?.createElement)return null;let d=w(o),f=o.createElement(`div`);f.className=`toast toast-${String(n||`neutral`).trim()}`,f.setAttribute(`role`,n===`danger`?`alert`:`status`),s(f,{motion:c,reason:l,event:u}),a(f,!0);let p=o.createElement(`span`);p.className=`toast-message`,p.textContent=String(e??``),f.append(p);let m=null,h=!1,g=!1,_=0,v=Math.max(0,Number(r)||0),y=new Set,b=o.defaultView||globalThis,x=b.setTimeout?.bind(b)||globalThis.setTimeout,S=b.clearTimeout?.bind(b)||globalThis.clearTimeout,C=({debit:e=!1}={})=>{m!=null&&(S(m),m=null,e&&(v=Math.max(0,v-(Date.now()-_))))},T=()=>{g||(g=!0,C(),f.removeEventListener(`pointerenter`,j),f.removeEventListener(`pointerleave`,M),f.removeEventListener(`focusin`,N),f.removeEventListener(`focusout`,P),o.removeEventListener?.(`visibilitychange`,F),f.remove(),d.childElementCount||d.remove())},D=({reason:e=`manual`,event:t=null,motion:n=c}={})=>{if(h)return;h=!0,C(),s(f,{motion:n,reason:e,event:t}),a(f,!1),f.classList.add(`is-leaving`);let r=e=>{e.target===f&&(f.removeEventListener(`transitionend`,r),T())};f.addEventListener(`transitionend`,r),x(T,E(f,b))},O=()=>{h||v<=0||y.size||(_=Date.now(),m=x(()=>D({reason:`timeout`}),v))},k=(e=`manual`)=>{y.add(e),C({debit:!0})},A=(e=`manual`)=>{y.delete(e),O()};function j(){k(`pointer`)}function M(){A(`pointer`)}function N(){k(`focus`)}function P(e){f.contains?.(e.relatedTarget)||A(`focus`)}function F(){o.hidden?k(`document`):A(`document`)}let I=o.createElement(`button`);return I.className=`icon-btn toast-dismiss`,I.type=`button`,I.setAttribute(`aria-label`,i),I.textContent=`×`,I.addEventListener(`click`,e=>D({reason:`dismiss`,event:e})),f.append(I),f.addEventListener(`pointerenter`,j),f.addEventListener(`pointerleave`,M),f.addEventListener(`focusin`,N),f.addEventListener(`focusout`,P),o.addEventListener?.(`visibilitychange`,F),d.append(f),o.hidden&&y.add(`document`),O(),{el:f,dismiss:D,pause:k,resume:A}}function E(e,t){let n=t.getComputedStyle?.(e);return D(n)}function D(e={}){let t=O(e?.transitionDuration),n=O(e?.transitionDelay),r=t.reduce((e,t,r)=>Math.max(e,t+(n[r%Math.max(n.length,1)]||0)),0);return Math.max(k,r+50)}function O(e=``){return String(e).split(`,`).map(e=>e.trim()).map(e=>{let t=Number.parseFloat(e);return Number.isFinite(t)?e.endsWith(`ms`)?t:t*1e3:0})}var k;function A(){return(A=e((()=>{o(),k=260})))()}function j(){let e=i();for(let[t,n]of[[`neutral`,`idle`],[`success`,`synced`],[`warn`,`needs review`],[`danger`,`failed`]]){let r=document.createElement(`span`);m(r,{label:n,tone:t}),e.append(r)}return e}function M(){let e=n();for(let t of[{kind:`loading`,message:`syncing your library…`},{kind:`empty`,message:`nothing on this shelf yet`},{kind:`inline-error`,message:`that ISBN does not look right`},{kind:`retryable-error`,message:`sync failed`,detail:`the server did not respond`,retryAction:`sync`},{kind:`blocking-error`,message:`library unavailable`,detail:`try again after reconnecting`}]){let n=document.createElement(`div`);m(n,t),e.append(n)}let t=e.querySelector(`[data-status-action="sync"]`);return t?.addEventListener(`click`,()=>{let e=t.parentElement.parentElement;m(e,{kind:`loading`,message:`trying again…`})}),e}function N(){let e=i(),n=t(`span`,`✨`,`ui-chip-emoji`);return n.setAttribute(`aria-hidden`,`true`),e.append(f({text:`fiction`}),f({text:`favorite`,prefixNode:n}),f({text:`borrowed`,variant:`quiet`}),f({text:`hardcover`,remove:{enabled:!0,label:`remove hardcover filter`}})),e.querySelector(`.ui-chip-remove`)?.addEventListener(`click`,e=>e.currentTarget.parentElement.remove()),e}function P(){let e=r(`<aside class="banner" aria-label="site update">
    <span class="banner-message">the catalog has been updated</span>
    <div class="banner-actions"><button class="btn" type="button">reload</button></div>
    <button class="icon-btn banner-dismiss" type="button" aria-label="dismiss update">×</button>
  </aside>`);return e.querySelector(`.banner-dismiss`).addEventListener(`click`,()=>e.remove()),e}function F(){let e=n(),r=t(`button`,`save book`,`btn`);return r.type=`button`,r.addEventListener(`click`,t=>{R?.dismiss({motion:`none`}),R=T(`book saved to your library`,{documentRef:e.ownerDocument,duration:3e4,event:t,reason:`trigger`,tone:`success`})}),e.append(r,t(`p`,`Toasts pause while hovered or focused and dismiss themselves.`,`vui-story-note`)),e}function I(){return r(`<div class="vui-story-row">
    <span class="badge">3</span>
    <span class="badge badge-quiet">12</span>
    <span class="badge badge-accent">99+</span>
    <button class="btn btn-secondary" type="button">loans <span class="badge badge-quiet">4</span></button>
  </div>`)}var L,R,z,B,V,H,U,W,G,K;function q(){return(q=e((()=>{p(),C(),A(),{expect:L}=__STORYBOOK_MODULE_TEST__,R=null,z={title:`Components/Status & feedback`,tags:[`autodocs`],async beforeEach(){return()=>{R?.dismiss({motion:`none`}),R=null,document.querySelectorAll(`.toast-stack`).forEach(e=>e.remove())}}},B={render:j},V={render:M,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`retry`})),await L(e.getByText(`trying again…`)).toBeVisible()}},H={render:N,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`remove hardcover filter`})),await L(e.queryByText(`hardcover`)).not.toBeInTheDocument()}},U={render:P,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`dismiss update`})),await L(e.queryByLabelText(`site update`)).not.toBeInTheDocument()}},W={render:F,play:async({canvas:e,canvasElement:t,userEvent:n})=>{await n.click(e.getByRole(`button`,{name:`save book`}));let r=t.ownerDocument.querySelector(`[role="status"].toast`);await L(r).toHaveTextContent(`book saved to your library`)}},G={render:I},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
  render: renderTones
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
  render: renderStates,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'retry'
    }));
    await expect(canvas.getByText('trying again…')).toBeVisible();
  }
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  render: renderChips,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'remove hardcover filter'
    }));
    await expect(canvas.queryByText('hardcover')).not.toBeInTheDocument();
  }
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  render: renderBanner,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'dismiss update'
    }));
    await expect(canvas.queryByLabelText('site update')).not.toBeInTheDocument();
  }
}`,...U.parameters?.docs?.source}}},W.parameters={...W.parameters,docs:{...W.parameters?.docs,source:{originalSource:`{
  render: renderToast,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'save book'
    }));
    const notification = canvasElement.ownerDocument.querySelector('[role="status"].toast');
    await expect(notification).toHaveTextContent('book saved to your library');
  }
}`,...W.parameters?.docs?.source}}},G.parameters={...G.parameters,docs:{...G.parameters?.docs,source:{originalSource:`{
  render: renderBadges
}`,...G.parameters?.docs?.source}}},K=[`Tones`,`ApplicationStates`,`Chips`,`Banner`,`Toast`,`Badges`]})))()}q();export{V as ApplicationStates,G as Badges,U as Banner,H as Chips,W as Toast,B as Tones,K as __namedExportsOrder,z as default};