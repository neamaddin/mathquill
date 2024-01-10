/*************************************************
 * Abstract classes of text blocks
 ************************************************/

/**
 * Blocks of plain text, with one or two TextPiece's as children.
 * Represents flat strings of typically serif-font Roman characters, as
 * opposed to hierchical, nested, tree-structured math.
 * Wraps a single HTMLSpanElement.
 */
class TextBlock extends MQNode {
  ctrlSeq = '\\text';
  ariaLabel = 'Text';
  replacedText?: string;
  anticursorPosition?: number;

  replaces(replacedText: Fragment | string) {
    if (replacedText instanceof Fragment) {
      this.replacedText = replacedText.remove().domFrag().text();
    } else if (typeof replacedText === 'string')
      this.replacedText = replacedText;
  }

  setDOMFrag(el: Element | undefined) {
    super.setDOM(el);
    const endsL = this.getEnd(L);
    if (endsL) {
      const children = this.domFrag().children();
      if (!children.isEmpty()) {
        endsL.setDOM(children.oneText());
      }
    }
    return this;
  }

  createLeftOf(cursor: Cursor) {
    var textBlock = this;
    super.createLeftOf(cursor);

    cursor.insAtRightEnd(textBlock);

    if (textBlock.replacedText)
      for (var i = 0; i < textBlock.replacedText.length; i += 1)
        textBlock.write(cursor, textBlock.replacedText.charAt(i));

    const textBlockR = textBlock[R];
    if (textBlockR) textBlockR.siblingCreated(cursor.options, L);
    const textBlockL = textBlock[L];
    if (textBlockL) textBlockL.siblingCreated(cursor.options, R);
    textBlock.bubble(function (node) {
      node.reflow();
      return undefined;
    });
  }

  parser() {
    var textBlock = this;

    var string = Parser.string;
    var regex = Parser.regex;
    var optWhitespace = Parser.optWhitespace;
    return optWhitespace
      .then(string('{'))
      .then(regex(/^(.*?)(?=}$)/))
      .skip(string('}'))
      .map(function (text) {
        if (text.length === 0) return new Fragment(0, 0);

        new TextPiece(text).adopt(textBlock, 0, 0);
        return textBlock;
      });
  }

  textContents() {
    return this.foldChildren('', function (text, child) {
      return text + (child as TextPiece).textStr;
    });
  }
  text() {
    return '"' + this.textContents() + '"';
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    var contents = this.textContents();
    if (contents.length > 0) {
      ctx.latex += this.ctrlSeq + '{';
      ctx.latex += contents.replace(/\\/g, '\\\\').replace(/[{}]/g, '\\$&');
      ctx.latex += '}';
    }

    this.checkCursorContextClose(ctx);
  }
  html() {
    const out = h('span', { class: 'mq-text-mode' }, [
      h.text(this.textContents()),
    ]);
    this.setDOM(out);
    NodeBase.linkElementByCmdNode(out, this);
    return out;
  }

  mathspeakTemplate = ['StartText', 'EndText'];
  mathspeak(opts?: MathspeakOptions) {
    if (opts && opts.ignoreShorthand) {
      return (
        this.mathspeakTemplate[0] +
        ', ' +
        this.textContents() +
        ', ' +
        this.mathspeakTemplate[1]
      );
    } else {
      return this.textContents();
    }
  }
  isTextBlock() {
    return true;
  }

  // editability methods: called by the cursor for editing, cursor movements,
  // and selection of the MathQuill tree, these all take in a direction and
  // the cursor
  moveTowards(dir: Direction, cursor: Cursor) {
    cursor.insDirOf(dir, this);
    cursor.controller.aria.queueDirOf(dir).queue(this);
  }
  moveOutOf(dir: Direction, cursor: Cursor) {
    cursor.insDirOf(dir, this);
    cursor.controller.aria.queueDirOf(dir).queue(this);
  }
  unselectInto(dir: Direction, cursor: Cursor) {
    this.moveTowards(dir, cursor);
  }

  // TODO: make these methods part of a shared mixin or something.
  selectTowards(dir: Direction, cursor: Cursor) {
    cursor.insDirOf(dir, this);
    cursor.controller.aria.queueDirOf(dir).queue(this);
  }
  deleteTowards(dir: Direction, cursor: Cursor) {
    cursor[dir] = this.remove()[dir];
  }

  selectOutOf(dir: Direction, cursor: Cursor) {
    cursor.insDirOf(dir, this);
  }
  deleteOutOf(_dir: Direction, cursor: Cursor) {
    // backspace and delete at ends of block don't unwrap
    if (this.isEmpty()) cursor.insRightOf(this);
  }
  // @ts-ignore
  write(cursor: Cursor, ch: string) {}
  // @ts-ignore
  writeLatex(cursor: Cursor, latex: string) {}

  seek(clientX: number, cursor: Cursor) {
    var displ =
      clientX - cursor.show().getBoundingClientRectWithoutMargin().left;
    var dir = displ && displ < 0 ? L : R;
    cursor.insDirOf(dir, this);
    cursor.controller.aria.queueDirOf(dir).queue(this);
  }

  blur(cursor: Cursor) {
    MathBlock.prototype.blur.call(this, cursor);
    if (!cursor) return;
    if (this.textContents() === '') {
      this.remove();
      if (cursor[L] === this) cursor[L] = this[L];
      else if (cursor[R] === this) cursor[R] = this[R];
    } else TextBlockFuseChildren(this);
  }
}

function TextBlockFuseChildren(self: TextBlock) {
  self.domFrag().oneElement().normalize();

  const children = self.domFrag().children();
  if (children.isEmpty()) return;
  const textPcDom = children.oneText();
  pray('only node in TextBlock span is Text node', textPcDom.nodeType === 3);
  // nodeType === 3 has meant a Text node since ancient times:
  //   http://reference.sitepoint.com/javascript/Node/nodeType

  var textPc = new TextPiece(textPcDom.data);
  textPc.setDOM(textPcDom);

  self.children().disown();
  textPc.adopt(self, 0, 0);
  return textPc;
}

/**
 * Piece of plain text, with a TextBlock as a parent and no children.
 * Wraps a single DOMTextNode.
 * For convenience, has a .textStr property that's just a JavaScript string
 * mirroring the text contents of the DOMTextNode.
 * Text contents must always be nonempty.
 */
class TextPiece extends MQNode {
  textStr: string;

  constructor(text: string) {
    super();
    this.textStr = text;
  }
  html() {
    const out = h.text(this.textStr);
    this.setDOM(out);
    return out;
  }
  appendText(text: string) {
    this.textStr += text;
    this.domFrag().oneText().appendData(text);
  }
  prependText(text: string) {
    this.textStr = text + this.textStr;
    this.domFrag().oneText().insertData(0, text);
  }
  insTextAtDirEnd(text: string, dir: Direction) {
    prayDirection(dir);
    if (dir === R) this.appendText(text);
    else this.prependText(text);
  }
  splitRight(i: number) {
    var newPc = new TextPiece(this.textStr.slice(i)).adopt(
      this.parent,
      this,
      this[R]
    );
    newPc.setDOM(this.domFrag().oneText().splitText(i));
    this.textStr = this.textStr.slice(0, i);
    return newPc;
  }

  endChar(dir: Direction, text: string) {
    return text.charAt(dir === L ? 0 : -1 + text.length);
  }

  moveTowards(dir: Direction, cursor: Cursor) {
    prayDirection(dir);

    var ch = this.endChar(-dir as Direction, this.textStr);

    var from = this[-dir as Direction];
    if (from instanceof TextPiece) from.insTextAtDirEnd(ch, dir);
    else new TextPiece(ch).createDir(-dir as Direction, cursor);
    return this.deleteTowards(dir, cursor);
  }

  mathspeak() {
    return this.textStr;
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.latex += this.textStr;
    this.checkCursorContextClose(ctx);
  }

  deleteTowards(dir: Direction, cursor: Cursor) {
    if (this.textStr.length > 1) {
      var deletedChar;
      if (dir === R) {
        this.domFrag().oneText().deleteData(0, 1);
        deletedChar = this.textStr[0];
        this.textStr = this.textStr.slice(1);
      } else {
        // note that the order of these 2 lines is annoyingly important
        // (the second line mutates this.textStr.length)
        this.domFrag()
          .oneText()
          .deleteData(-1 + this.textStr.length, 1);
        deletedChar = this.textStr[this.textStr.length - 1];
        this.textStr = this.textStr.slice(0, -1);
      }
      cursor.controller.aria.queue(deletedChar);
    } else {
      this.remove();
      cursor[dir] = this[dir];
      cursor.controller.aria.queue(this.textStr);
    }
  }

  selectTowards(dir: Direction, cursor: Cursor) {
    prayDirection(dir);
    var anticursor = cursor.anticursor;
    if (!anticursor) return;

    var ch = this.endChar(-dir as Direction, this.textStr);

    if (anticursor[dir] === this) {
      var newPc = new TextPiece(ch).createDir(dir, cursor);
      anticursor[dir] = newPc;
      cursor.insDirOf(dir, newPc);
    } else {
      var from = this[-dir as Direction];
      if (from instanceof TextPiece) from.insTextAtDirEnd(ch, dir);
      else {
        var newPc = new TextPiece(ch).createDir(-dir as Direction, cursor);
        var selection = cursor.selection;
        if (selection) {
          newPc.domFrag().insDirOf(-dir as Direction, selection.domFrag());
        }
      }

      if (this.textStr.length === 1 && anticursor[-dir as Direction] === this) {
        anticursor[-dir as Direction] = this[-dir as Direction]; // `this` will be removed in deleteTowards
      }
    }

    return this.deleteTowards(dir, cursor);
  }
}

LatexCmds.text =
  LatexCmds.textnormal =
  LatexCmds.textrm =
  LatexCmds.textup =
  LatexCmds.textmd =
    TextBlock;

function makeTextBlock(
  latex: string,
  ariaLabel: string,
  tagName: HTMLTagName,
  attrs: { style?: string; class: string }
) {
  return class extends TextBlock {
    ctrlSeq = latex;
    mathspeakTemplate = ['Start' + ariaLabel, 'End' + ariaLabel];
    ariaLabel = ariaLabel;

    html() {
      const out = h(tagName, attrs, [h.text(this.textContents())]);
      this.setDOM(out);
      NodeBase.linkElementByCmdNode(out, this);
      return out;
    }
  };
}

LatexCmds.em =
  LatexCmds.italic =
  LatexCmds.italics =
  LatexCmds.emph =
  LatexCmds.textit =
  LatexCmds.textsl =
    makeTextBlock('\\textit', 'Italic', 'i', { class: 'mq-text-mode' });
LatexCmds.strong =
  LatexCmds.bold =
  LatexCmds.textbf =
    makeTextBlock('\\textbf', 'Bold', 'b', { class: 'mq-text-mode' });
LatexCmds.sf = LatexCmds.textsf = makeTextBlock(
  '\\textsf',
  'Sans serif font',
  'span',
  { class: 'mq-sans-serif mq-text-mode' }
);
LatexCmds.tt = LatexCmds.texttt = makeTextBlock(
  '\\texttt',
  'Mono space font',
  'span',
  { class: 'mq-monospace mq-text-mode' }
);
LatexCmds.textsc = makeTextBlock('\\textsc', 'Variable font', 'span', {
  style: 'font-variant:small-caps',
  class: 'mq-text-mode',
});
LatexCmds.uppercase = makeTextBlock('\\uppercase', 'Uppercase', 'span', {
  style: 'text-transform:uppercase',
  class: 'mq-text-mode',
});
LatexCmds.lowercase = makeTextBlock('\\lowercase', 'Lowercase', 'span', {
  style: 'text-transform:lowercase',
  class: 'mq-text-mode',
});

class RootMathCommand extends MathCommand {
  cursor: Cursor;
  constructor(cursor: Cursor) {
    super('$');
    this.cursor = cursor;
  }
  domView = new DOMView(1, (blocks) =>
    h.block('span', { class: 'mq-math-mode' }, blocks[0])
  );
  createBlocks() {
    super.createBlocks();
    const endsL = this.getEnd(L) as RootMathCommand; // TODO - how do we know this is a RootMathCommand?
    endsL.cursor = this.cursor;
    endsL.write = function (cursor: Cursor, ch: string) {
      if (ch !== '$') MathBlock.prototype.write.call(this, cursor, ch);
      else if (this.isEmpty()) {
        cursor.insRightOf(this.parent);
        this.parent.deleteTowards(undefined!, cursor);
        new VanillaSymbol('\\$', h.text('$')).createLeftOf(cursor.show());
      } else if (!cursor[R]) cursor.insRightOf(this.parent);
      else if (!cursor[L]) cursor.insLeftOf(this.parent);
      else MathBlock.prototype.write.call(this, cursor, ch);
    };
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.latex += '$';
    this.getEnd(L).latexRecursive(ctx);
    ctx.latex += '$';
    this.checkCursorContextClose(ctx);
  }
}

class RootTextBlock extends RootMathBlock {
  keystroke(key: string, e: KeyboardEvent, ctrlr: Controller) {
    if (key === 'Spacebar' || key === 'Shift-Spacebar') return;
    return super.keystroke(key, e, ctrlr);
  }
  write(cursor: Cursor, ch: string) {
    cursor.show().deleteSelection();
    if (ch === '$') new RootMathCommand(cursor).createLeftOf(cursor);
    else {
      var html;
      if (ch === '<') html = h.entityText('&lt;');
      else if (ch === '>') html = h.entityText('&gt;');
      new VanillaSymbol(ch, html).createLeftOf(cursor);
    }
  }
}
API.TextField = function (APIClasses: APIClasses) {
  return class TextField extends APIClasses.EditableField {
    static RootBlock = RootTextBlock;
    __mathquillify() {
      super.mathquillify('mq-editable-field mq-text-mode');
      return this;
    }
    latex(): string;
    latex(l: string): IEditableField;
    latex(latex?: string) {
      if (latex) {
        this.__controller.renderLatexText(latex);
        if (this.__controller.blurred)
          this.__controller.cursor.hide().parent.blur();

        const _this: IBaseMathQuill = this; // just to help help TS out
        return _this;
      }
      return this.__controller.exportLatex();
    }
  };
};
