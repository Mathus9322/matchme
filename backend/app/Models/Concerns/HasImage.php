<?php

namespace App\Models\Concerns;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Image stockée sur le disque « public » dans la colonne indiquée par imageColumn().
 * Le fichier est supprimé quand l'image est remplacée ou quand le modèle est supprimé.
 */
trait HasImage
{
    abstract protected function imageColumn(): string;

    abstract protected function imageFolder(): string;

    public static function bootHasImage(): void
    {
        static::deleted(fn ($model) => $model->deleteImageFile());
    }

    public function storeImage(UploadedFile $file): void
    {
        $this->deleteImageFile();
        $this->forceFill([$this->imageColumn() => $file->store($this->imageFolder(), 'public')])->save();
    }

    public function removeImage(): void
    {
        $this->deleteImageFile();
        $this->forceFill([$this->imageColumn() => null])->save();
    }

    /** URL relative (/storage/…), servie par Laravel et relayée par le proxy Angular. */
    public function imageUrl(): ?string
    {
        $path = $this->getAttribute($this->imageColumn());

        return $path ? '/storage/'.$path : null;
    }

    private function deleteImageFile(): void
    {
        $path = $this->getOriginal($this->imageColumn());
        if ($path) {
            Storage::disk('public')->delete($path);
        }
    }
}
