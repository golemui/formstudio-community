import {
  ChangeDetectorRef,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as Core from '@golemui/core';
import { FormComponent as GuiFormComponent } from '@golemui/gui-angular';
import { Dependencies } from '@golemui/gui-shared';
import { golemForm } from '@golemui/gui-shared/internals';
import { AiService, ChatHistoryEntry, FileAttachment, StreamEvent } from '../ai.service';
import { DesignComponent } from '../design/design.component';
import { PropertiesPanelComponent } from '../design/properties-panel.component';
import { EditorComponent } from '../editor/editor.component';
import { TokenMeterComponent } from '../token-meter/token-meter.component';
import { TypewriterComponent } from '../typewriter/typewriter.component';
import snarkdown from 'snarkdown';

interface AttachedFile {
  name: string;
  mimeType: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'thinking' | 'tool_call';
  content: string;
  toolInput?: Record<string, unknown>;
  toolErrors?: string[];
  thinkingGroupId?: number;
  attachments?: AttachedFile[];
}

type DisplayItem =
  | { kind: 'message'; msg: ChatMessage; isFirstInThinkingGroup: boolean }
  | { kind: 'tool_group'; tools: ChatMessage[] };

const defaultMessageUid = 'golemui-studio-default-message';

const initialFormJson = () => {
  const form = golemForm().create({
    form: [
      {
        uid: defaultMessageUid,
        kind: 'display',
        type: 'alert',
        props: {
          text: 'Use the prompt to update the form',
          level: 'info',
        },
      },
    ],
  });
  return { form: form.form.children };
};

@Component({
  imports: [
    FormsModule,
    GuiFormComponent,
    DesignComponent,
    PropertiesPanelComponent,
    TokenMeterComponent,
    EditorComponent,
    TypewriterComponent,
  ],
  providers: [],
  selector: 'gui-form-studio',
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FormStudioComponent {
  chatApiUrl = input('/api/chat');
  unhandledStreamEvent = output<{ type: string; [key: string]: unknown }>();
  private cdr = inject(ChangeDetectorRef);
  private ai = inject(AiService, { optional: true, skipSelf: true }) ?? new AiService();
  private designComp = viewChild<DesignComponent>('designComp');
  private chatHistory = viewChild<ElementRef<HTMLElement>>('chatHistory');
  protected activeTab: 'form' | 'json' | 'design' = 'form';
  protected viewportSize: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  protected readonly viewportWidths = { mobile: '375px', tablet: '768px', desktop: '100%' };
  protected designSelectedWidget: Record<string, unknown> | null = null;
  protected collapsedToolbarGroups = new Set<string>();
  protected formValidateOn = signal<Core.ValidateOn>('eager');
  protected formLocale = signal<string>('en');
  protected formPropertiesWidget = computed(() => ({
    type: '__form__',
    uid: 'form',
    validateOn: this.formValidateOn(),
    locale: this.formLocale(),
  }));

  protected toggleToolbarGroup(group: string) {
    if (this.collapsedToolbarGroups.has(group)) {
      this.collapsedToolbarGroups.delete(group);
    } else {
      this.collapsedToolbarGroups.add(group);
    }
  }
  protected chatInput =
    'Create a registration form with required fields email, password, confirm password and a submit button';

  protected messages: ChatMessage[] = [
    { role: 'assistant', content: 'Hello! Describe the form you want to build.' },
  ];
  protected error = '';
  protected formJson = signal(JSON.stringify(initialFormJson(), undefined, 2));
  protected deps: Dependencies = {
    markdown: {
      parse: (md: string) => snarkdown(md),
    },
  };
  protected guiFormConfig = computed(() => ({
    formDef: this.formJson(),
    data: {},
    customWidgetLoaders: {},
    customValidators: {},
    validateOn: 'eager' as Core.ValidateOn,
    autocomplete: 'off',
    dependencies: this.deps,
  }));

  // Percentage of the LLM context window consumed in the current conversation.
  // Null until the first response completes (server emits context_usage event).
  protected contextUsedPercent = signal<number | null>(null);

  protected contextTooltipText = computed(() => {
    const pct = this.contextUsedPercent();
    if (pct === null) {
      return '';
    }
    return `${pct}% of context window used`;
  });

  protected readonly workingWords = [
    'Thinking',
    'Designing',
    'Building',
    'Composing',
    'Validating',
    'Assembling',
    'Crafting',
    'Generating',
    'Structuring',
    'Configuring',
    'Rendering',
    'Scaffolding',
    'Wiring',
    'Binding',
    'Nesting',
    'Theming',
    'Layouting',
    'Painting',
    'Mounting',
    'Orchestrating',
    'Aligning',
    'Shaping',
    'Templating',
    'Weaving',
    'Polishing',
  ];
  protected thinking = false;
  protected collapsedGroups = new Set<number>();
  private thinkingGroupId = 0;
  protected pendingFiles: FileAttachment[] = [];
  protected fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private convHistory: ChatHistoryEntry[] = [];
  protected isDragOver = false;
  protected fileError = '';
  private readonly MAX_FILE_SIZE = 15 * 1024 * 1024;

  protected onJsonChange(value: string) {
    this.formJson.set(value);
  }

  protected onChatInputChange(value: string) {
    this.chatInput = value;
  }

  protected switchTab(tab: 'form' | 'json' | 'design') {
    if (this.activeTab === 'design' && tab !== 'design') {
      this.designSelectedWidget = null;
    }
    this.activeTab = tab;
  }

  protected get canSend(): boolean {
    return (this.chatInput.trim().length > 0 || this.pendingFiles.length > 0) && !this.thinking;
  }

  private resolveMimeType(file: File): string {
    const type = file.type || 'application/octet-stream';
    const SUPPORTED = new Set([
      'application/pdf',
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'text/x-typescript',
      'text/csv',
      'text/markdown',
      'text/x-python',
      'text/xml',
      'text/rtf',
      'application/x-javascript',
      'application/x-typescript',
      'application/x-python',
      'application/rtf',
    ]);
    if (SUPPORTED.has(type)) {
      return type;
    }
    if (type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/')) {
      return type;
    }
    if (type.startsWith('text/') || type === 'application/json' || type === 'application/xml') {
      return 'text/plain';
    }
    return type;
  }

  private processFiles(files: FileList | File[]): void {
    this.fileError = '';
    Array.from(files).forEach((file) => {
      if (file.size > this.MAX_FILE_SIZE) {
        this.fileError = `"${file.name}" exceeds the 15 MB limit.`;
        return;
      }
      const mimeType = this.resolveMimeType(file);
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        this.pendingFiles = [...this.pendingFiles, { name: file.name, mimeType, base64Data }];
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    });
  }

  protected onAttachClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processFiles(input.files);
    }
    input.value = '';
  }

  protected removeFile(index: number): void {
    this.pendingFiles = this.pendingFiles.filter((_, i) => i !== index);
  }

  protected onChatDragOver(event: DragEvent): void {
    const hasFiles = event.dataTransfer?.types.includes('Files');
    if (!hasFiles) {
      return;
    }
    event.preventDefault();
    this.isDragOver = true;
  }

  protected onChatDragLeave(event: DragEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
      this.isDragOver = false;
    }
  }

  protected onChatDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    if (event.dataTransfer?.files.length) {
      this.processFiles(event.dataTransfer.files);
    }
  }

  private buildMessageWithFormContext(userMessage: string): string {
    const currentJson = this.formJson();

    let parsed: unknown;
    try {
      parsed = JSON.parse(currentJson);
    } catch {
      return userMessage;
    }

    const form = (parsed as { form?: unknown[] })?.form;
    const isDefaultPlaceholder =
      !Array.isArray(form) ||
      (form.length === 1 && (form[0] as { uid?: string })?.uid === defaultMessageUid);

    if (isDefaultPlaceholder) {
      return userMessage;
    }

    // If the form matches Claude's last response it already knows the state from history.
    const lastModelEntry = [...this.convHistory].reverse().find((e) => e.role === 'model');
    if (lastModelEntry) {
      try {
        const lastModelForm = JSON.parse(lastModelEntry.parts[0].text);
        if (JSON.stringify(lastModelForm) === JSON.stringify(parsed)) {
          return userMessage;
        }
      } catch {
        // Parsing failed -- fall through and inject to be safe.
      }
    }

    return (
      `Current form definition (the user has edited this since your last response -- ` +
      `preserve all existing widgets, UIDs, labels, validation rules, and properties ` +
      `exactly unless explicitly asked to change them):\n` +
      `\`\`\`json\n${currentJson}\n\`\`\`\n\n` +
      `User request: ${userMessage}`
    );
  }

  protected async sendMessage() {
    if (!this.canSend) {
      return;
    }

    this.thinkingGroupId++;

    const filesToSend = [...this.pendingFiles];
    const attachments: AttachedFile[] = filesToSend.map(({ name, mimeType }) => ({
      name,
      mimeType,
    }));

    this.messages.push({
      role: 'user',
      content: this.chatInput,
      attachments: attachments.length ? attachments : undefined,
    });
    this.thinking = true;
    this.fileError = '';
    const userMessage = this.chatInput;
    this.chatInput = '';
    this.pendingFiles = [];

    const messageToSend = this.buildMessageWithFormContext(userMessage);

    let currentGroupId = this.thinkingGroupId;
    const groupsCreated = new Set<number>();
    this.convHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    try {
      const response = await this.ai.sendMessage(
        messageToSend,
        filesToSend,
        this.convHistory.slice(0, -1),
        this.chatApiUrl(),
        (event: StreamEvent) => {
          if (event.type === 'thought_start') {
            groupsCreated.add(currentGroupId);
            this.messages.push({
              role: 'thinking',
              content: '',
              thinkingGroupId: currentGroupId,
            });
          } else if (event.type === 'thought_delta') {
            const last = this.messages[this.messages.length - 1];
            if (last?.role === 'thinking') {
              last.content += event.text;
            }
          } else if (event.type === 'thought_end') {
            // unused for now
          } else if (event.type === 'tool_call') {
            this.messages.push({
              role: 'tool_call',
              content: event.name,
              toolInput: event.input,
            });
            this.thinkingGroupId++;
            currentGroupId = this.thinkingGroupId;
          } else if (event.type === 'tool_result') {
            const target = [...this.messages]
              .reverse()
              .find((m) => m.role === 'tool_call' && m.content === event.name);
            if (target) {
              target.toolErrors = event.errors;
            }
          } else if (event.type === 'context_usage') {
            this.contextUsedPercent.set(event.usedPercent);
          } else {
            this.unhandledStreamEvent.emit(event as { type: string; [key: string]: unknown });
          }
          this.scrollChatToBottom();
          this.cdr.detectChanges();
        },
      );

      for (const id of groupsCreated) {
        this.collapsedGroups.add(id);
      }

      if (response) {
        this.convHistory.push({ role: 'model', parts: [{ text: JSON.stringify(response) }] });
        this.formJson.set(JSON.stringify(response, undefined, 2));
      }
    } catch (err: unknown) {
      this.thinking = false;
      this.messages.push({
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      });
      this.scrollChatToBottom();
    } finally {
      this.thinking = false;
      this.cdr.detectChanges();
    }
  }

  protected onFormHealth(formHealth: Core.FormHealth) {
    if (formHealth.status === 'errored') {
      this.error = formHealth.message;
    }
  }

  protected onFormEvent(event: Core.FormEvent) {
    console.log('onFormEvent', event);
  }

  protected onToolbarDragStart(event: DragEvent, kind: string, type: string) {
    event.dataTransfer?.setData('application/golem-widget', JSON.stringify({ kind, type }));
    event.dataTransfer!.effectAllowed = 'copy';
  }

  protected onDesignWidgetChange(flatData: Record<string, unknown>) {
    this.designComp()?.onWidgetChange(flatData);
  }

  protected onFormPropertiesChange(flatData: Record<string, unknown>) {
    if ('validateOn' in flatData) {
      this.formValidateOn.set(flatData['validateOn'] as Core.ValidateOn);
    }
    if ('locale' in flatData) {
      this.formLocale.set(flatData['locale'] as string);
    }
  }

  protected onFormDefChange(newJson: string) {
    this.formJson.set(newJson);
  }

  protected toggleThinkingGroup(groupId: number) {
    if (this.collapsedGroups.has(groupId)) {
      this.collapsedGroups.delete(groupId);
    } else {
      this.collapsedGroups.add(groupId);
    }
  }

  protected get displayMessages(): DisplayItem[] {
    const result: DisplayItem[] = [];
    for (const msg of this.messages) {
      if (msg.role === 'tool_call') {
        const prev = result[result.length - 1];
        if (prev?.kind === 'tool_group') {
          prev.tools.push(msg);
        } else {
          result.push({ kind: 'tool_group', tools: [msg] });
        }
      } else {
        const prev = result[result.length - 1];
        const isFirstInThinkingGroup =
          msg.role === 'thinking' &&
          (prev?.kind !== 'message' || prev.msg.thinkingGroupId !== msg.thinkingGroupId);
        result.push({ kind: 'message', msg, isFirstInThinkingGroup });
      }
    }
    return result;
  }

  protected getThinkingGroupCount(groupId: number): number {
    return this.messages.filter((m) => m.thinkingGroupId === groupId).length;
  }

  protected toolCallLabel(msg: ChatMessage): string {
    const input = msg.toolInput as Record<string, string> | undefined;
    if (msg.content === 'get_widget_spec') {
      return `Getting spec for "${input?.['widgetType'] ?? '?'}"`;
    }
    if (msg.content === 'get_concept') {
      return `Looking up "${input?.['conceptName'] ?? '?'}"`;
    }
    if (msg.content === 'validate_form_definition') {
      return 'Validating form definition';
    }
    return msg.content;
  }

  private scrollChatToBottom() {
    const el = this.chatHistory()?.nativeElement;
    if (el) {
      setTimeout(() => (el.scrollTop = el.scrollHeight));
    }
  }
}
