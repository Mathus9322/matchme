<?php

namespace App\Http\Controllers;

use App\Models\Competition;
use App\Models\CompetitionDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CompetitionDocumentController extends Controller
{
    public const MAX_KILOBYTES = 10240;

    /**
     * Renvoie les dossiers visibles : le sien uniquement, ou tous pour l'organisateur et les admins.
     */
    public function index(Request $request, Competition $competition): JsonResponse
    {
        $user = $request->user();
        $manages = $competition->isManagedBy($user);

        $documents = $competition->documents()
            ->with('user:id,name')
            ->unless($manages, fn ($q) => $q->where('user_id', $user->id))
            ->latest()
            ->get();

        $folders = $documents->groupBy('user_id')->map(fn ($docs) => [
            'user' => ['id' => $docs->first()->user->id, 'name' => $docs->first()->user->name],
            'documents' => $docs->map(fn ($doc) => $this->documentData($doc))->values(),
            'total_size' => $docs->sum('size'),
        ]);

        // Le dossier de l'utilisateur courant apparaît toujours, en premier, même vide.
        $mine = $folders->pull($user->id) ?? ['user' => ['id' => $user->id, 'name' => $user->name], 'documents' => [], 'total_size' => 0];

        return response()->json([
            'data' => [$mine, ...$folders->sortBy('user.name')->values()],
            'can_manage' => $manages,
            'max_kilobytes' => self::MAX_KILOBYTES,
        ]);
    }

    public function store(Request $request, Competition $competition): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => ['file', 'max:'.self::MAX_KILOBYTES, 'mimes:pdf,doc,docx,odt,xls,xlsx,ods,ppt,pptx,odp,txt,csv,jpg,jpeg,png,gif,webp,zip'],
        ], [
            'files.required' => 'Choisissez au moins un fichier.',
            'files.*.uploaded' => 'Le fichier n’a pas pu être envoyé (taille maximale du serveur dépassée ?).',
            'files.*.max' => 'Chaque fichier doit faire au plus 10 Mo.',
            'files.*.mimes' => 'Type de fichier non autorisé.',
        ]);

        $user = $request->user();
        $folder = CompetitionDocument::folder($competition->id, $user->id);

        $documents = collect($request->file('files'))->map(fn ($file) => $competition->documents()->create([
            'user_id' => $user->id,
            'name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'path' => $file->store($folder, 'local'),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
        ]));

        return response()->json(['data' => $documents->map(fn ($doc) => $this->documentData($doc))], 201);
    }

    public function download(Request $request, CompetitionDocument $document): StreamedResponse
    {
        abort_unless($document->isVisibleTo($request->user()), 403, 'Vous n’avez pas accès à ce document.');

        return Storage::disk('local')->download($document->path, $document->name);
    }

    public function destroy(Request $request, CompetitionDocument $document): Response
    {
        abort_unless($document->isVisibleTo($request->user()), 403, 'Vous ne pouvez pas supprimer ce document.');
        $document->delete();

        return response()->noContent();
    }

    private function documentData(CompetitionDocument $document): array
    {
        return [
            'id' => $document->id,
            'name' => $document->name,
            'mime_type' => $document->mime_type,
            'size' => $document->size,
            'created_at' => $document->created_at,
        ];
    }
}
