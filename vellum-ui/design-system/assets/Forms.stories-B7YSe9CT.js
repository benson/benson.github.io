import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{n as t,r as n}from"./controlPrimitives-Cg8obPNg.js";import{a as r,i,n as a}from"./storyHelpers-SrU9jVcn.js";function o(){return a(`<form class="vui-story-stack" style="width: min(420px, 100%)">
    ${t({label:`book title`,controlHtml:`<input class="input" name="title" value="A Wizard of Earthsea">`})}
    ${t({label:`format`,controlHtml:`<select name="format"><option>hardcover</option><option>paperback</option></select>`})}
    ${t({label:`notes`,controlHtml:`<textarea name="notes" rows="3" placeholder="condition, edition, provenance…"></textarea>`})}
    <button class="btn" type="submit">save book</button>
  </form>`)}function s(){return a(`<form class="vui-story-stack" style="width: min(420px, 100%)">
    <label class="field-row">shelf name
      <input class="input" name="shelf" value="" aria-invalid="true" aria-describedby="shelf-error">
      <span class="field-error" id="shelf-error">give this shelf a name</span>
    </label>
    <button class="btn" type="submit">create shelf</button>
  </form>`)}function c(){let e=i();e.innerHTML=`
    <button type="button" class="field-chrome field-disclosure" aria-expanded="false">any publication year</button>
    <label class="field-row">collection name
      <span class="field-group">
        <button type="button" class="field-group-addon" aria-label="choose collection icon">📚</button>
        <input class="field-group-control" type="text" value="reading room">
      </span>
    </label>`;let t=e.querySelector(`.field-disclosure`);return t.addEventListener(`click`,()=>{t.setAttribute(`aria-expanded`,String(t.getAttribute(`aria-expanded`)!==`true`))}),e}function l(){return a(`<fieldset class="vui-story-stack" style="border: 0; padding: 0">
    <legend class="vui-story-label">catalog filters</legend>
    <label><input type="checkbox" checked> first editions only</label>
    <label><input type="checkbox"> signed copies</label>
    <label><input type="radio" name="binding" checked> any binding</label>
    <label><input type="radio" name="binding"> hardcover</label>
    <label class="switch"><input type="checkbox" class="switch-input" checked><span class="switch-track"></span>available now</label>
    <label class="field-row">minimum rating<input type="range" min="0" max="5" value="4"></label>
  </fieldset>`)}function u(){let e=document.createElement(`section`);e.className=`vui-component-lab-section`,e.append(r(`h3`,`Control × state matrix`),r(`p`,`Judge vertical rhythm, label weight, field geometry, and state contrast together.`,`vui-story-note`));let t=document.createElement(`table`);t.className=`vui-component-matrix`,t.innerHTML=`<thead><tr><th scope="col">state</th><th scope="col">text</th><th scope="col">select</th><th scope="col">textarea</th></tr></thead><tbody>
    <tr><th scope="row">default</th><td><label class="field-row">title<input class="input" value="Piranesi"></label></td><td><label class="field-row">format<select><option>hardcover</option></select></label></td><td><label class="field-row">notes<textarea rows="2">signed copy</textarea></label></td></tr>
    <tr><th scope="row">empty</th><td><label class="field-row">title<input class="input" placeholder="book title"></label></td><td><label class="field-row">format<select><option value="">choose…</option></select></label></td><td><label class="field-row">notes<textarea rows="2" placeholder="optional"></textarea></label></td></tr>
    <tr><th scope="row">invalid</th><td><label class="field-row">title<input class="input" aria-invalid="true" aria-describedby="matrix-error"><span class="field-error" id="matrix-error">title is required</span></label></td><td><label class="field-row">format<select aria-invalid="true"><option>unknown</option></select></label></td><td><label class="field-row">notes<textarea rows="2" aria-invalid="true">too long</textarea></label></td></tr>
    <tr><th scope="row">disabled</th><td><label class="field-row">title<input class="input" value="Piranesi" disabled></label></td><td><label class="field-row">format<select disabled><option>hardcover</option></select></label></td><td><label class="field-row">notes<textarea rows="2" disabled>signed copy</textarea></label></td></tr>
  </tbody>`,e.append(t);let n=document.createElement(`div`);return n.className=`vui-component-lab`,n.append(e),n}function d(){let e=document.createElement(`div`);e.className=`vui-component-lab`;for(let t of[280,520]){let n=document.createElement(`section`);n.className=`vui-component-lab-section`,n.style.width=`min(${t}px, 100%)`,n.append(r(`h3`,`${t}px surface`),a(`<label class="field-row">a deliberately long field label that still needs to read clearly<input class="input" value="The Left Hand of Darkness — signed anniversary edition"></label>`),a(`<label class="field-row">notes<textarea rows="3">Purchased from a small shop while traveling; dust jacket has a tiny crease along the upper edge.</textarea></label>`),a(`<div class="vui-story-row"><button class="btn" type="button">save changes</button><button class="btn btn-secondary" type="button">cancel</button></div>`)),e.append(n)}return e}var f,p,m,h,g,_,v,y,b;function x(){return(x=e((()=>{n(),{expect:f}=__STORYBOOK_MODULE_TEST__,p={title:`Components/Forms`,tags:[`autodocs`]},m={render:o,play:async({canvas:e,userEvent:t})=>{let n=e.getByRole(`textbox`,{name:`book title`});await t.clear(n),await t.type(n,`Piranesi`),await f(n).toHaveValue(`Piranesi`)}},h={render:s},g={name:`Triggers & groups`,render:c,play:async({canvas:e,userEvent:t})=>{let n=e.getByRole(`button`,{name:`any publication year`});await t.click(n),await f(n).toHaveAttribute(`aria-expanded`,`true`)}},_={render:l},v={name:`Deep dive: control matrix`,render:u},y={name:`Deep dive: responsive stress`,render:d},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: renderFields,
  play: async ({
    canvas,
    userEvent
  }) => {
    const title = canvas.getByRole('textbox', {
      name: 'book title'
    });
    await userEvent.clear(title);
    await userEvent.type(title, 'Piranesi');
    await expect(title).toHaveValue('Piranesi');
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: renderValidation
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  name: 'Triggers & groups',
  render: renderFieldChrome,
  play: async ({
    canvas,
    userEvent
  }) => {
    const trigger = canvas.getByRole('button', {
      name: 'any publication year'
    });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: renderSelectionControls
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  name: 'Deep dive: control matrix',
  render: renderControlMatrix
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  name: 'Deep dive: responsive stress',
  render: renderResponsiveStress
}`,...y.parameters?.docs?.source}}},b=[`Fields`,`Validation`,`FieldChrome`,`SelectionControls`,`ControlMatrix`,`ResponsiveStress`]})))()}x();export{v as ControlMatrix,g as FieldChrome,m as Fields,y as ResponsiveStress,_ as SelectionControls,h as Validation,b as __namedExportsOrder,p as default};