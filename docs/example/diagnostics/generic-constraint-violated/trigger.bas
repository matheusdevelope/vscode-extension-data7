' @example: diagnostics/generic-constraint-violated/trigger
' @demonstrates: constraint Class TList<T As TEnum> violada por Integer
' @diagnostics: generic-constraint-violated@10
' @requires: classes TEnum + CardAdm declaradas no workspace
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim a As TList<CardAdm>
         Dim b As TList<Integer>
      End Sub
   End Class
End Namespace
