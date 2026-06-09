' @example: sugar/generic-tlist/_expected/03-nested
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/generic-tlist/03-nested
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim matriz As TList_TList_Integer
      End Sub
   End Class
   Class TList_Integer
      x As Integer
   End Class
   Class TList_TList_Integer
      x As TList_Integer
   End Class
End Namespace
