import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';

@Component({
  selector: 'app-typewriter',
  templateUrl: './typewriter.component.html',
  styleUrl: './typewriter.component.scss',
})
export class TypewriterComponent implements OnInit {
  words = input<string[]>([]);

  protected displayText = signal('');
  protected showCursor = signal(true);

  private currentWordIndex = -1;
  private recentIndexes: number[] = [];
  private charIndex = 0;
  private isDeleting = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.pickNextWord();
    this.tick();

    this.destroyRef.onDestroy(() => {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    });
  }

  private pickNextWord() {
    const words = this.words();
    if (!words.length) {
      return;
    }
    if (words.length === 1) {
      this.currentWordIndex = 0;
      this.charIndex = 0;
      this.isDeleting = false;
      return;
    }
    const historySize = Math.min(4, words.length - 1);
    const excluded = new Set(this.recentIndexes.slice(-historySize));
    const candidates = words.map((_, i) => i).filter((i) => !excluded.has(i));
    const nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
    this.recentIndexes.push(nextIndex);
    if (this.recentIndexes.length > historySize) {
      this.recentIndexes.shift();
    }
    this.currentWordIndex = nextIndex;
    this.charIndex = 0;
    this.isDeleting = false;
  }

  private tick() {
    const words = this.words();
    if (!words.length) {
      return;
    }

    const currentWord = words[this.currentWordIndex];

    if (this.isDeleting) {
      this.charIndex--;
      this.displayText.set(currentWord.slice(0, this.charIndex));

      if (this.charIndex === 0) {
        this.pickNextWord();
        // Brief pause before starting to type the next word
        this.timer = setTimeout(() => this.tick(), 300);
      } else {
        this.timer = setTimeout(() => this.tick(), 45 + Math.random() * 25);
      }
    } else {
      this.charIndex++;
      this.displayText.set(currentWord.slice(0, this.charIndex));

      if (this.charIndex === currentWord.length) {
        // Word fully typed: wait 1.5-2s then start deleting
        this.isDeleting = true;
        this.timer = setTimeout(() => this.tick(), 1500 + Math.random() * 500);
      } else {
        this.timer = setTimeout(() => this.tick(), 80 + Math.random() * 40);
      }
    }
  }
}
