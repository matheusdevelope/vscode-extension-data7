' @example: diagnostics/auto-new-non-default-ctor/trigger
' @demonstrates: Dim x As New T mas T só tem construtor com args — runtime falha
' @diagnostics: auto-new-non-default-ctor@5
' @requires: classe TNeedsArgs sem construtor sem-args
'
Namespace mod_demo
   Sub Run()
      Dim x As New TNeedsArgs
   End Sub
End Namespace
