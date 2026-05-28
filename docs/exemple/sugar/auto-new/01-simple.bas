' @example: sugar/auto-new/01-simple
' @demonstrates: Dim x As New T (sem `()`) expandido para `= New T()`
' @diagnostics: none
' @transpiled-to: sugar/auto-new/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As New StringList
         list.Add("a")
      End Sub
   End Class
End Namespace
