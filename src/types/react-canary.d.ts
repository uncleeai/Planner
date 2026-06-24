// Włącza typy z kanału canary Reacta (m.in. ViewTransition), które w App Routerze
// dostarcza Next przez swój wbudowany build Reacta. Sam moduł 'react/canary' nie
// istnieje w runtime — to wyłącznie referencja typów (nie trafia do bundla).
/// <reference types="react/canary" />
