'use client';

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';

const STORAGE_URL = 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/cycle-photos';

interface PhotoViewerProps {
  beforePath?: string | null;
  afterPath?: string | null;
}

export function PhotoViewer({ beforePath, afterPath }: PhotoViewerProps) {
  if (!beforePath && !afterPath) return <span className="text-muted-foreground">—</span>;

  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="ghost" size="sm" type="button">
          <Camera className="mr-1 h-4 w-4" />
          Фото
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <div className="grid gap-4 md:grid-cols-2">
          {beforePath && (
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">До</p>
              <img src={`${STORAGE_URL}/${beforePath}`} alt="До стерилізації" className="rounded-lg w-full" />
            </div>
          )}
          {afterPath && (
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Після</p>
              <img src={`${STORAGE_URL}/${afterPath}`} alt="Після стерилізації" className="rounded-lg w-full" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
