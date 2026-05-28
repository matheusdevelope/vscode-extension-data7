' @example: sugar/pipe/01-basic
' @demonstrates: |> operator — data |> Trim |> UCase vira UCase(Trim(data))
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pInput As String)
         Dim r As String = pInput |> Trim |> UCase
         Print r
      End Sub
   End Class
End Namespace
