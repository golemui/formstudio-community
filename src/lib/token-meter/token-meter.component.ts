import { Component, computed, input } from '@angular/core';

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

@Component({
  imports: [],
  selector: 'app-token-meter',
  templateUrl: './token-meter.component.html',
  styleUrl: './token-meter.component.scss',
})
export class TokenMeterComponent {
  current = input<number>(0);
  max = input<number>(1);
  tooltipText = input<string>('');

  protected readonly circumference = CIRCUMFERENCE;

  protected percentage = computed(() => {
    const pct = Math.min((this.current() / this.max()) * 100, 100);
    return pct < 1 ? Math.ceil(pct) : Math.round(pct);
  });

  protected dashOffset = computed(() => {
    return CIRCUMFERENCE * (1 - this.percentage() / 100);
  });

  protected trackColor = computed(() => {
    const pct = this.percentage();
    if (pct >= 90) {
      return '#ef4444'; // critically full
    }
    if (pct >= 70) {
      return '#eab308'; // filling up
    }
    return '#22c55e'; // plenty of space left
  });
}
