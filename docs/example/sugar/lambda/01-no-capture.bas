' @example: sugar/lambda/01-no-capture
' @demonstrates: alternativa nativa enquanto lambdas inline não são transpilados
' @diagnostics: none
'
' Data7 não tem closures com captura. A forma idiomática equivalente a
' `lista.Find((item, i, x) => item.Nome = "X")` em outras linguagens é
' uma `Shared Function` nomeada + chamada com `extra As Variant`:
'
Namespace mod_demo

   Delegate Function CardRecordFindDelegate(pValue As CardRecord, i As Integer, extra As Variant) As Boolean

   Class Helper
      Shared Function PorNome(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
         PorNome = (pValue.Nome = CStr(extra))
      End Function
   End Class

   Class TDemo
      Public Function Achar(lista As CardRecordList, pNome As String) As CardRecord
         Achar = lista.Find(Helper.PorNome, pNome)
      End Function
   End Class

End Namespace
