<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Espace de gestion : réservé aux managers et aux administrateurs. */
class EnsureUserIsStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user()?->canOrganize(), 403, 'Accès réservé aux managers et aux administrateurs.');

        return $next($request);
    }
}
