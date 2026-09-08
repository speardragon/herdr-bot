import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import type { TranscriptCardEntry, WidgetCardMessage, WidgetOption } from "../protocol";
import { projectLeafEntry, useAdapterVersion, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";
import { SandButton, SandIconButton, SandKeycap } from "../../../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/view-CIFdOvCz.js#byteOffset=0 (widget card leaf)
// @evidence src/app/dist/renderer/assets/view-CIFdOvCz.js#byteOffset=3491 (widget keyboard/custom/interaction lifecycle)
// @evidence src/app/dist/renderer/assets/view-CIFdOvCz.js#byteOffset=9840 (resolved and dismissed states)

function optionValue(option: WidgetOption): string {
  return option.value ?? option.label;
}

function optionLabel(options: readonly WidgetOption[], value: string): string {
  return options.find((option) => optionValue(option) === value)?.label ?? value;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLElement && target.isContentEditable;
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

function WidgetKey({ value, settled = false }: { value: string; settled?: boolean }) {
  return <SandKeycap aria-hidden="true" className={`sand-widget-option__key sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-16xo4sp sand-4p5aij sand-mzs88n sand-1j85h84 sand-6wrskw sand-12oqio5 sand-qjedn3 sand-1y0btm7 sand-1atdlfd sand-luhinc sand-169k319${settled ? " sand-ti2d7y" : ""}`}>{value}</SandKeycap>;
}

type WidgetEntry = TranscriptCardEntry & { message: WidgetCardMessage };

function WidgetQuestion({ entry, isKeyboardTarget, isStale }: TranscriptCardLeafProps & { entry: WidgetEntry }) {
  const providers = useTranscriptCardLeafProviders();
  const adapter = providers?.widgetInteractions ?? null;
  const version = useAdapterVersion(adapter);
  void version;
  const widget = entry.message.widget;
  const [customValue, setCustomValue] = useState("");
  const titleId = useId();
  const snapshot = adapter?.getSnapshot(entry.id);
  const pending = snapshot?.state === "pending";
  const canAct = !isStale && providers?.scope.agentId != null && adapter != null && !pending;
  const submit = (value: string) => {
    if (!canAct || value.trim().length === 0) return;
    void adapter.respond(entry.id, value);
  };
  const dismiss = () => {
    if (!canAct) return;
    void adapter.dismiss(entry.id);
  };

  useEffect(() => {
    if (!isKeyboardTarget || !canAct) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.key.length !== 1) return;
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement) || document.querySelector('[role="dialog"], [aria-modal="true"]') != null) return;
      const index = event.key.toUpperCase().charCodeAt(0) - 65;
      const option = widget.options[index];
      if (option == null) return;
      event.preventDefault();
      submit(optionValue(option));
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [canAct, isKeyboardTarget, widget.options]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(customValue);
  };
  const handleCustomKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submit(customValue);
  };

  return <form aria-labelledby={titleId} className="sand-widget sand-widget--choices sand-78zum5 sand-1cy8zhl sand-167g77z sand-euugli" onSubmit={handleSubmit}>
    <div className="sand-widget__heading-row sand-78zum5 sand-1iyjqo2 sand-s83m0k sand-dt5ytf sand-euugli">
      <div className="sand-widget__heading sand-78zum5 sand-dt5ytf sand-h8yej3 sand-euugli">
        <p className="sand-widget__title sand-10im51j sand-rxpjvj sand-euugli sand-1wd3ewq sand-j0a0fe" id={titleId}>{widget.prompt}</p>
        {widget.helpText == null ? null : <p className="sand-widget__subtitle sand-10im51j sand-rxpjvj sand-19aaqeu sand-j0a0fe">{widget.helpText}</p>}
      </div>
      <SandIconButton aria-label="Dismiss question" className="sand-widget__dismiss" disabled={!canAct} icon="close" onClick={dismiss} size="sm" title="Dismiss without answering" type="button" variant="ghost" />
    </div>
    <div className="sand-widget__options sand-78zum5 sand-dt5ytf sand-h8yej3 sand-euugli sand-qjedn3 sand-1y0btm7 sand-q03nf1 sand-ur7f20 sand-b3r6kr sand-13l7odt">
      {widget.options.map((option, index) => <button aria-keyshortcuts={isKeyboardTarget ? letter(index).toLowerCase() : undefined} className="sand-widget-option sand-78zum5 sand-1iyjqo2 sand-s83m0k sand-dt5ytf sand-1cy8zhl sand-euugli" disabled={!canAct} key={`${optionValue(option)}-${index}`} onClick={() => submit(optionValue(option))} type="button">
        <WidgetKey value={letter(index)} />
        <span className="sand-widget-option__body sand-78zum5 sand-1iyjqo2 sand-s83m0k sand-dt5ytf sand-1cy8zhl sand-euugli"><span className="sand-widget-option__label sand-1heor9g sand-euugli sand-eaf4i8 sand-j0a0fe sand-dpxx8g">{option.label}</span>{option.description == null ? null : <span className="sand-widget-option__description sand-euugli sand-eaf4i8 sand-j0a0fe sand-dpxx8g sand-19aaqeu">{option.description}</span>}</span>
      </button>)}
    </div>
    {widget.allowCustom !== true ? null : <div className="sand-widget__custom-row sand-78zum5 sand-1cy8zhl sand-167g77z sand-h8yej3 sand-euugli">
      <div className="sand-widget__custom-field sand-1iyjqo2 sand-s83m0k sand-1r8uery sand-euugli sand-1lliihq sand-5f5z56 sand-9f619 sand-126k92a sand-j0a0fe sand-tt52l0 sand-10wlt62 sand-123j3cw sand-cicffo sand-s9asl8 sand-1lqa7cf sand-ng3xce sand-ur7f20 sand-jbqb8w sand-1wd3ewq sand-jb2p0i sand-if65rj sand-1fc57z9 sand-12oo3zp sand-1t137rt sand-1h7ufjq"><textarea aria-label="Custom answer" autoComplete="off" className="sand-widget__custom-input" disabled={!canAct} onChange={(event) => setCustomValue(event.currentTarget.value)} onKeyDown={handleCustomKeyDown} placeholder="Type your own answer" rows={1} spellCheck={false} value={customValue} /></div>
      {customValue.trim().length === 0 ? null : <SandButton className="sand-widget__custom-submit" disabled={!canAct} size="sm" type="submit" variant="secondary">Submit</SandButton>}
    </div>}
  </form>;
}

function WidgetResolved({ entry, answer }: { entry: WidgetEntry; answer: string }) {
  const options = entry.message.widget.options;
  const selectedIndex = options.findIndex((option) => optionValue(option) === answer);
  return <div aria-label="Your answer" className="sand-widget sand-widget--resolved sand-dt5ytf sand-h8yej3 sand-euugli sand-qjedn3 sand-1y0btm7 sand-q03nf1 sand-ur7f20 sand-b3r6kr" role="group">
    <p className="sand-widget__title sand-10im51j sand-rxpjvj sand-euugli sand-1wd3ewq sand-j0a0fe">{entry.message.widget.prompt}</p>
    <div className="sand-widget__options" role="group">
      <div className="sand-widget-option sand-widget-option--selected sand-78zum5 sand-6s0dn4 sand-167g77z sand-h8yej3 sand-euugli sand-e8ttls">{selectedIndex >= 0 ? <WidgetKey settled value={letter(selectedIndex)} /> : null}<span className="sand-widget-option__body"><span className="sand-widget-option__label sand-euugli sand-eaf4i8 sand-j0a0fe sand-dpxx8g sand-1ybxsvs">{optionLabel(options, answer)}</span></span><span title="Selected">✓</span></div>
    </div>
  </div>;
}

function WidgetDismissed({ entry }: { entry: WidgetEntry }) {
  return <div className="sand-widget sand-widget--dismissed sand-3nfvp2 sand-6s0dn4 sand-17d4w8g sand-2lah0s sand-1nn3v0j sand-y13l1i sand-1120s5i sand-163pfp sand-149ho13 sand-19aaqeu sand-1ciwos8" data-dismissed="true" role="group"><p className="sand-widget__title sand-1iyjqo2 sand-s83m0k sand-euugli sand-10im51j sand-rxpjvj sand-19aaqeu sand-j0a0fe">{entry.message.widget.prompt}</p><span className="sand-widget__dismissed-pill sand-1v4s8kt sand-ols6we sand-149ho13 sand-2lah0s sand-xa9ouo">Dismissed</span></div>;
}

export function WidgetTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  if (entry == null || entry.message.type !== "widget") return null;
  const widgetEntry = entry as WidgetEntry;
  const providers = useTranscriptCardLeafProviders();
  const adapter = providers?.widgetInteractions ?? null;
  const snapshot = adapter?.getSnapshot(widgetEntry.id);
  const answer = widgetEntry.respondedValue ?? (snapshot?.state === "answered" ? snapshot.value : null);
  const dismissed = widgetEntry.widgetDismissed === true || props.isStale === true && widgetEntry.message.widget.dismissOnMoveOn === true || snapshot?.state === "dismissed";
  const content = answer == null && !dismissed ? <WidgetQuestion {...props} entry={widgetEntry} /> : dismissed ? <WidgetDismissed entry={widgetEntry} /> : <WidgetResolved entry={widgetEntry} answer={answer ?? ""} />;
  return content;
}

export default WidgetTranscriptCard;
