' @example: sugar/generic-tlist/03-nested
' @demonstrates: generics aninhados — TList<TList<Integer>> vira TList_TList_Integer
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/03-nested.bas
'
Namespace mod_demo

   Class TList<T>
      Public x As T
   End Class

   Class TDemo
      Public Sub Run()
         Dim matriz As TList<TList<Integer>>
      End Sub
   End Class

End Namespace
