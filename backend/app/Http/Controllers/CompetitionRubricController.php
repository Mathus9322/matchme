<?php

namespace App\Http\Controllers;

use App\Models\Competition;
use App\Models\CompetitionRubric;
use App\Models\RubricPreset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class CompetitionRubricController extends Controller
{
    /** Catalogue des rubriques prédéfinies. */
    public function presets(): JsonResponse
    {
        return response()->json(['data' => RubricPreset::orderBy('position')->get()->map(fn (RubricPreset $preset) => [
            'id' => $preset->id,
            'name' => $preset->name,
            'description' => $preset->description,
            'points' => $preset->points,
            'penalties' => $preset->penalties,
        ])]);
    }

    public function updateScoring(Request $request, Competition $competition): JsonResponse
    {
        $this->authorizeCompetition($request, $competition);
        $validated = $request->validate($this->scaleRules());

        $competition->update(['scoring' => $this->normalizeScale($validated)]);

        return response()->json(['data' => $competition->scale()]);
    }

    public function store(Request $request, Competition $competition): JsonResponse
    {
        $this->authorizeCompetition($request, $competition);
        $validated = $request->validate($this->rubricRules());

        $rubric = $competition->rubrics()->create([
            ...$this->normalizeScale($validated),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'position' => $competition->rubrics()->max('position') + 1,
        ]);

        return response()->json(['data' => $rubric->toData()], 201);
    }

    /** Ajoute plusieurs rubriques du catalogue telles quelles. */
    public function storePresets(Request $request, Competition $competition): JsonResponse
    {
        $this->authorizeCompetition($request, $competition);
        $validated = $request->validate([
            'preset_ids' => ['required', 'array', 'min:1'],
            'preset_ids.*' => ['integer', 'distinct', 'exists:rubric_presets,id'],
        ], ['preset_ids.required' => 'Choisissez au moins une rubrique.']);

        $position = (int) $competition->rubrics()->max('position');
        $presets = RubricPreset::whereIn('id', $validated['preset_ids'])->orderBy('position')->get();

        foreach ($presets as $preset) {
            $competition->rubrics()->create([
                'name' => $preset->name,
                'description' => $preset->description,
                'points' => $preset->points,
                'penalties' => $preset->penalties,
                'position' => ++$position,
            ]);
        }

        return response()->json(['created' => $presets->count()], 201);
    }

    public function update(Request $request, CompetitionRubric $rubric): JsonResponse
    {
        $this->authorizeCompetition($request, $rubric->competition);
        $validated = $request->validate($this->rubricRules());

        $rubric->update([
            ...$this->normalizeScale($validated),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json(['data' => $rubric->toData()]);
    }

    public function destroy(Request $request, CompetitionRubric $rubric): Response
    {
        $this->authorizeCompetition($request, $rubric->competition);
        $rubric->delete();

        return response()->noContent();
    }

    /** Échange la rubrique avec sa voisine pour la monter ou la descendre dans le programme. */
    public function move(Request $request, CompetitionRubric $rubric): Response
    {
        $competition = $rubric->competition;
        $this->authorizeCompetition($request, $competition);
        $direction = $request->validate(['direction' => ['required', Rule::in(['up', 'down'])]])['direction'];

        $rubrics = $competition->rubrics()->get()->values();
        $index = $rubrics->search(fn ($r) => $r->id === $rubric->id);
        $target = $direction === 'up' ? $index - 1 : $index + 1;

        if (isset($rubrics[$target])) {
            [$rubrics[$index], $rubrics[$target]] = [$rubrics[$target], $rubrics[$index]];
            $rubrics->each(fn ($r, $position) => $r->update(['position' => $position]));
        }

        return response()->noContent();
    }

    private function scaleRules(): array
    {
        return [
            'points' => ['required', 'array', 'min:1', 'max:8'],
            'points.*' => ['integer', 'between:1,500', 'distinct'],
            'penalties' => ['required', 'boolean'],
        ];
    }

    private function rubricRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:2000'],
            ...$this->scaleRules(),
        ];
    }

    /** @return array{points: list<int>, penalties: bool} */
    private function normalizeScale(array $validated): array
    {
        return [
            'points' => array_values(array_map('intval', $validated['points'])),
            'penalties' => (bool) $validated['penalties'],
        ];
    }

    private function authorizeCompetition(Request $request, Competition $competition): void
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
    }
}
