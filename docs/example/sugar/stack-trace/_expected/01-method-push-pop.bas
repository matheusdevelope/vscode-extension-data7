' @example: sugar/stack-trace/01-method-push-pop
' @demonstrates: Push no início do método e Pop antes de Return/Exit e no fim
' @diagnostics: none
'
Sub Run()
   StackTrace.Push("Principal.Run", "C:\project\src\Principal.bas", 6)
   Print(1)
   StackTrace.Pop()
   Return
End Sub
