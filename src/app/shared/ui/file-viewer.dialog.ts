import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { FileViewerComponent, ViewerItem } from './file-viewer.component';

export interface FileViewerData {
  items: readonly ViewerItem[];
  start?: number;
}

/** The viewer as an overlay (UX 5.5: images open in a viewer, never as a direct link). */
@Component({
  selector: 'ib-file-viewer-dialog',
  imports: [FileViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ib-file-viewer [items]="data.items" [start]="data.start ?? 0" />`,
})
export class FileViewerDialogComponent {
  protected readonly data = inject<FileViewerData>(NZ_MODAL_DATA);
}
