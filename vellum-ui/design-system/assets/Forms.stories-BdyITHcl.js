import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{n as t,r as n}from"./controlPrimitives-Cg8obPNg.js";import{i as r,n as i}from"./storyHelpers-SrU9jVcn.js";function a(){return i(`<form class="vui-story-stack" style="width: min(420px, 100%)">
    ${t({label:`book title`,controlHtml:`<input class="input" name="title" value="A Wizard of Earthsea">`})}
    ${t({label:`format`,controlHtml:`<select name="format"><option>hardcover</option><option>paperback</option></select>`})}
    ${t({label:`notes`,controlHtml:`<textarea name="notes" rows="3" placeholder="condition, edition, provenance…"></textarea>`})}
    <button class="btn" type="submit">save book</button>
  </form>`)}function o(){return i(`<form class="vui-story-stack" style="width: min(420px, 100%)">
    <label class="field-row">shelf name
      <input class="input" name="shelf" value="" aria-invalid="true" aria-describedby="shelf-error">
      <span class="field-error" id="shelf-error">give this shelf a name</span>
    </label>
    <button class="btn" type="submit">create shelf</button>
  </form>`)}function s(){let e=r();e.innerHTML=`
    <button type="button" class="field-chrome field-disclosure" aria-expanded="false">any publication year</button>
    <label class="field-row">collection name
      <span class="field-group">
        <button type="button" class="field-group-addon" aria-label="choose collection icon">📚</button>
        <input class="field-group-control" type="text" value="reading room">
      </span>
    </label>`;let t=e.querySelector(`.field-disclosure`);return t.addEventListener(`click`,()=>{t.setAttribute(`aria-expanded`,String(t.getAttribute(`aria-expanded`)!==`true`))}),e}function c(){return i(`<fieldset class="vui-story-stack" style="border: 0; padding: 0">
    <legend class="vui-story-label">catalog filters</legend>
    <label><input type="checkbox" checked> first editions only</label>
    <label><input type="checkbox"> signed copies</label>
    <label><input type="radio" name="binding" checked> any binding</label>
    <label><input type="radio" name="binding"> hardcover</label>
    <label class="switch"><input type="checkbox" class="switch-input" checked><span class="switch-track"></span>available now</label>
    <label class="field-row">minimum rating<input type="range" min="0" max="5" value="4"></label>
  </fieldset>`)}var l,u,d,f,p,m,h;function g(){return(g=e((()=>{n(),{expect:l}=__STORYBOOK_MODULE_TEST__,u={title:`Components/Forms`,tags:[`autodocs`]},d={render:a,play:async({canvas:e,userEvent:t})=>{let n=e.getByRole(`textbox`,{name:`book title`});await t.clear(n),await t.type(n,`Piranesi`),await l(n).toHaveValue(`Piranesi`)}},f={render:o},p={name:`Triggers & groups`,render:s,play:async({canvas:e,userEvent:t})=>{let n=e.getByRole(`button`,{name:`any publication year`});await t.click(n),await l(n).toHaveAttribute(`aria-expanded`,`true`)}},m={render:c},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
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
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: renderValidation
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
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
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: renderSelectionControls
}`,...m.parameters?.docs?.source}}},h=[`Fields`,`Validation`,`FieldChrome`,`SelectionControls`]})))()}g();export{p as FieldChrome,d as Fields,m as SelectionControls,f as Validation,h as __namedExportsOrder,u as default};