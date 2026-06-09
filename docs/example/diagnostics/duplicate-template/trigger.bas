' @example: diagnostics/duplicate-template/trigger
' @demonstrates: two top-level generic declarations share the same name
' @diagnostics: duplicate-template@11
'
Namespace mod_demo

   Class TList<T>
      Public Count As Integer
   End Class

   Class TList<U>
      Public Total As Integer
   End Class

End Namespace
