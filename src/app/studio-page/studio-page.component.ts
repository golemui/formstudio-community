import { Component } from '@angular/core';
import { FormStudioComponent } from '../../lib/public-api';

@Component({
  selector: 'app-studio-page',
  imports: [FormStudioComponent],
  template: `<gui-form-studio chatApiUrl="/api/chat" />`,
  styles: [':host { display: block; height: 100vh; }'],
})
export class StudioPageComponent {}
