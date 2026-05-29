' @example: sugar/generic-tlist/03-nested
' @demonstrates: generics aninhados — TList<TList<Integer>> vira TList_TList_Integer
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/03-nested.bas
'
Namespace mod_demo


   Class TDemo
      Public Sub Run()
         Dim matriz As TList_TList_Integer
      End Sub
   End Class

   Class TList_Integer
      Public x As Integer
   End Class
   Class TList_TList_Integer
      Public x As TList_Integer
   End Class
End Namespace
