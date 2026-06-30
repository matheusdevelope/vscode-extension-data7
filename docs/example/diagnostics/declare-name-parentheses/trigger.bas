' @example: diagnostics/declare-name-parentheses/trigger
' @demonstrates: Declare name cannot use empty parentheses before Lib/Alias
' @diagnostics: declare-name-parentheses@6
'
Namespace mod_winapi
   Private Declare Function _GetForegroundWindow() Lib "user32.dll" Alias "GetForegroundWindow" As Long
End Namespace
