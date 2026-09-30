import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ClipboardEntry} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/database/database.js';
import {TextItem} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/items/textItem.js';
import {CodeItem} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/items/codeItem.js';
import {EditDialog} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/components/editDialog.js';
const xml = `<node><interface name="org.communitybig.PreviewTest"><method name="Run"><arg type="s" direction="out"/></method><method name="Demo"><arg type="s" direction="out"/></method><method name="Close"/></interface></node>`;
const pause = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {resolve(); return GLib.SOURCE_REMOVE;}));
const check = (ok, message) => {if (!ok) throw new Error(message);};
const shell = '#!/bin/bash\n\necho "Isso é apenas um teste"\nif [ a="b" ]; the\n  echo "$b"';
const note = '**Apenas um texto de teste**\n\n- Pesquisar\n- Planejar\n*Itálico*';
export default class extends Extension {
    enable() {this.bus = Gio.DBusExportedObject.wrapJSObject(xml, this); this.bus.export(Gio.DBus.session, '/org/communitybig/PreviewTest');}
    disable() {this.Close(); this.bus.unexport();}
    get ext() {return Main.extensionManager.lookup('big-clipboard@communitybig.org')?.stateObj;}
    entry(type, text, i = 0) {return new ClipboardEntry(2000000100+i, type, text, false, i ? 'teal' : null, GLib.DateTime.new_now_utc(), null, '', 'Teste');}
    async RunAsync(_params, invocation) {
        const cards = [];
        let editor;
        try {
            const ext = this.ext;
            check(ext?.hljs, 'highlighter loaded');
            const before = [...ext.clipboardDialog._entries.values()].map(e => [e.id,e.content,e.subjects,e.tag]);
            const converted = await ext.clipboardManager.convertContent({type: 0, text: shell});
            check(converted[0] === 'Code' && converted[1] === shell && converted[2].language.id === 'bash', 'shell capture preserves source and detects bash');
            const md = await ext.clipboardManager.convertContent({type:0, text:note});
            check(md[0] === 'Text' && md[1] === note, 'Markdown is a note');
            const entry = this.entry('Text', note, 1);
            const card = new TextItem(ext, entry); cards.push(card);
            check(card._text.clutter_text.text.includes('Apenas um texto de teste') && !card._text.clutter_text.text.includes('**'), 'Markdown markers removed');
            check(card._text.clutter_text.get_layout().get_attributes() !== null && card._text.clutter_text.text.includes('• Pesquisar'), 'Pango attributes and list bullets');
            editor = new EditDialog(ext, entry);
            check(editor._entry.clutter_text.text === note, 'editor retains Markdown source');
            editor.destroy(); editor = null;
            await ext.clipboardManager.copyEntry(entry);
            const copied = await new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c,text) => resolve(text)));
            check(copied === note, 'copy retains source');
            entry.content = shell;
            check(card._code?.language.id === 'bash' && !card._text.visible, 'existing text and edited note render shell');
            check(card._code._highlighted.includes('<span'), 'shell syntax colors');
            check(entry.type === 'Text' && entry.content === shell && entry.subjects === 'Teste' && entry.tag === 'teal', 'preview does not migrate stored records');
            entry.content = String.raw`C:\Users\notes <b>literal</b>`;
            check(!card._code && card._text.clutter_text.text === entry.content, 'return to escaped plain text');
            entry.content = 'x'.repeat(100000);
            check(card._text.clutter_text.text.length === 4096 && entry.content.length === 100000, 'bounded card, intact source');
            const code = new CodeItem(ext, this.entry('Code', shell)); cards.push(code);
            check(code._code._highlighted.includes('<span'), 'code card colors');
            this.Demo(); await pause();
            const add = this.cards[0]._subjects._add;
            const box = add.get_allocation_box();
            check(Math.abs(box.get_width()-box.get_height()) < 0.01, 'square add button allocation');
            check(box.get_width() <= 22*St.ThemeContext.get_for_stage(global.stage).scale_factor, 'compact add button');
            check(JSON.stringify(before) === JSON.stringify([...ext.clipboardDialog._entries.values()].map(e=>[e.id,e.content,e.subjects,e.tag])), 'history unchanged');
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify({ok:true, checks:['capture detection','Markdown preview','raw editor and copy','existing text fallback','content changes','bounded rendering','code colors','round compact add button','history preserved'], addSize:[box.get_width(),box.get_height()]})]));
        } catch(error) {invocation.return_value(new GLib.Variant('(s)', [JSON.stringify({ok:false,error:String(error),stack:error.stack})]));}
        finally {this.Close(); for (const card of cards) card.destroy(); editor?.destroy();}
    }
    Demo() {
        this.Close();
        Main.overview.hide();
        this.box = new St.BoxLayout({style_class:'clipboard-dialog', style:'padding: 16px; spacing: 12px;', x:60, y:100});
        this.cards = [new TextItem(this.ext,this.entry('Text',shell)), new TextItem(this.ext,this.entry('Text',note,1)), new CodeItem(this.ext,this.entry('Code','const greet = (name) => {\n  console.log(`Olá, ${name}!`);\n};\ngreet("GNOME");',2))];
        for (const card of this.cards) {card.set_size(250,210); this.box.add_child(card);}
        Main.layoutManager.addChrome(this.box);
        return 'shown';
    }
    Close() {this.box?.destroy(); this.box=null; this.cards=[];}
}
